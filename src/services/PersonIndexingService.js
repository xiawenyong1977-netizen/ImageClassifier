import { logger } from '../adapters/WebAdapters';
import UnifiedDataService from './UnifiedDataService';

const DEFAULT_SIMILARITY_THRESHOLD = 0.78;
const DEFAULT_GROUP_PREFIX = 'person';

function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, ' ')
    .trim();
}

function tokenizeText(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
}

function extractMobileNetTokens(mobileNetV3Detections) {
  if (!mobileNetV3Detections) return [];
  const tokenCandidates = [];

  if (Array.isArray(mobileNetV3Detections)) {
    mobileNetV3Detections.forEach(item => {
      if (!item) return;
      const label = item.className || item.label || item.category || item.name;
      if (label) tokenCandidates.push(String(label));
    });
  } else if (Array.isArray(mobileNetV3Detections.predictions)) {
    mobileNetV3Detections.predictions.forEach(item => {
      const label = item?.className || item?.label || item?.category || item?.name;
      if (label) tokenCandidates.push(String(label));
    });
  } else if (typeof mobileNetV3Detections === 'object') {
    Object.entries(mobileNetV3Detections).forEach(([key, value]) => {
      if (typeof value === 'number' && value > 0.2) {
        tokenCandidates.push(key);
      }
    });
  }

  return tokenCandidates
    .slice(0, 12)
    .flatMap(text => tokenizeText(text));
}

function buildImageTokens(image) {
  const tokens = [];

  tokens.push(...tokenizeText(image?.fileName || ''));
  tokens.push(...tokenizeText(image?.message || ''));
  tokens.push(...extractMobileNetTokens(image?.mobileNetV3Detections));

  if (image?.background_color) {
    tokens.push(`bg_${String(image.background_color).toLowerCase()}`);
  }

  return Array.from(new Set(tokens));
}

function overlapScore(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let overlap = 0;
  setA.forEach(token => {
    if (setB.has(token)) {
      overlap++;
    }
  });

  const denom = Math.sqrt(setA.size * setB.size);
  return denom > 0 ? overlap / denom : 0;
}

class GroupProfile {
  constructor(groupId) {
    this.groupId = groupId;
    this.tokens = [];
    this.imageCount = 0;
  }

  addTokens(tokens) {
    if (!tokens || tokens.length === 0) {
      this.imageCount += 1;
      return;
    }
    const merged = new Set([...this.tokens, ...tokens]);
    this.tokens = Array.from(merged);
    this.imageCount += 1;
  }

  score(tokens) {
    return overlapScore(this.tokens, tokens);
  }
}

class PersonIndexingService {
  constructor() {
    this.groupCounter = 0;
  }

  createGroupId() {
    this.groupCounter += 1;
    return `${DEFAULT_GROUP_PREFIX}_${Date.now().toString(36)}_${this.groupCounter.toString(36)}`;
  }

  async indexSinglePersonImages(options = {}) {
    const {
      images = null,
      onProgress = null,
      source = 'heuristic-js',
      threshold = null
    } = options;

    const settings = await UnifiedDataService.readSettings();
    const similarityThreshold = typeof threshold === 'number'
      ? threshold
      : (typeof settings.personIndexSimilarityThreshold === 'number' ? settings.personIndexSimilarityThreshold : DEFAULT_SIMILARITY_THRESHOLD);

    const allSinglePersonImages = Array.isArray(images)
      ? images
      : await UnifiedDataService.readImagesByCategory('single_person');

    if (!allSinglePersonImages || allSinglePersonImages.length === 0) {
      return {
        processedCount: 0,
        assignedCount: 0,
        skippedCount: 0,
        totalSinglePerson: 0
      };
    }

    const imageById = new Map(
      allSinglePersonImages
        .filter(img => img && img.id)
        .map(img => [img.id, img])
    );

    const existingPersonData = await UnifiedDataService.imageStorageService.getPersonData();
    const existingAssignments = new Map();
    Object.entries(existingPersonData || {}).forEach(([imageId, data]) => {
      if (data?.person_group_id) {
        existingAssignments.set(imageId, data.person_group_id);
      }
    });

    const profiles = new Map();
    existingAssignments.forEach((groupId, imageId) => {
      const image = imageById.get(imageId);
      if (!image) return;
      const tokens = buildImageTokens(image);
      if (!profiles.has(groupId)) {
        profiles.set(groupId, new GroupProfile(groupId));
      }
      profiles.get(groupId).addTokens(tokens);
    });

    const candidates = allSinglePersonImages.filter(image => {
      if (!image || !image.id) return false;
      return !existingAssignments.has(image.id);
    });

    if (candidates.length === 0) {
      return {
        processedCount: 0,
        assignedCount: 0,
        skippedCount: allSinglePersonImages.length,
        totalSinglePerson: allSinglePersonImages.length
      };
    }

    const updates = [];
    let processedCount = 0;

    for (const image of candidates) {
      processedCount += 1;
      const tokens = buildImageTokens(image);
      let bestGroupId = null;
      let bestScore = 0;

      profiles.forEach(profile => {
        const score = profile.score(tokens);
        if (score > bestScore) {
          bestScore = score;
          bestGroupId = profile.groupId;
        }
      });

      let assignedGroupId = bestGroupId;
      let assignedScore = bestScore;
      if (!assignedGroupId || bestScore < similarityThreshold) {
        assignedGroupId = this.createGroupId();
        assignedScore = 1;
      }

      if (!profiles.has(assignedGroupId)) {
        profiles.set(assignedGroupId, new GroupProfile(assignedGroupId));
      }
      profiles.get(assignedGroupId).addTokens(tokens);

      updates.push({
        imageId: image.id,
        personGroupId: assignedGroupId,
        personScore: assignedScore,
        personSource: source
      });

      if (typeof onProgress === 'function') {
        onProgress(processedCount, candidates.length);
      }
    }

    if (updates.length > 0) {
      await UnifiedDataService.updateImagesPersonGrouping(updates, { refreshCache: false });
    }

    logger.info(`👤 人物分组完成: 总单人照片=${allSinglePersonImages.length}, 新分组=${updates.length}, 阈值=${similarityThreshold}`);

    return {
      processedCount: candidates.length,
      assignedCount: updates.length,
      skippedCount: allSinglePersonImages.length - candidates.length,
      totalSinglePerson: allSinglePersonImages.length
    };
  }
}

export default PersonIndexingService;
