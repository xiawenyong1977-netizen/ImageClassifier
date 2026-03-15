import { logger, getUri } from '../adapters/WebAdapters';
import UnifiedDataService from './UnifiedDataService';
import FaceEmbeddingService from './FaceEmbeddingService';
import FaceDetectionService from './FaceDetectionService';
import ImageProcessor from './ImageProcessor';

const DEFAULT_SIMILARITY_THRESHOLD = 0.75;
const LEGACY_DEFAULT_SIMILARITY_THRESHOLD = 0.78;
const DEFAULT_GROUP_PREFIX = 'person';
const DEFAULT_GROUP_MERGE_OFFSET = 0.03;
const MIN_GROUP_MERGE_THRESHOLD = 0.7;
const SMALL_GROUP_RELAXED_OFFSET = 0.07;
const MIN_SMALL_GROUP_MERGE_THRESHOLD = 0.66;
const SMALL_GROUP_MAX_SIZE = 2;
const MEMBER_REASSIGN_OFFSET = 0.04;
const MIN_MEMBER_REASSIGN_THRESHOLD = 0.71;
const MEMBER_REASSIGN_AVG_OFFSET = 0.02;
const MIN_MEMBER_REASSIGN_AVG_THRESHOLD = 0.73;
const MEMBER_REASSIGN_TARGET_MIN_SIZE = 2;
const MEMBER_REASSIGN_SOURCE_MAX_SIZE = 3;
const SINGLE_MEMBER_REASSIGN_OFFSET = 0.07;
const MIN_SINGLE_MEMBER_REASSIGN_THRESHOLD = 0.68;
const SINGLE_MEMBER_REASSIGN_AVG_OFFSET = 0.05;
const MIN_SINGLE_MEMBER_REASSIGN_AVG_THRESHOLD = 0.7;
const ARCFACE_TEMPLATE_112 = [
  { x: 38.2946, y: 51.6963 },
  { x: 73.5318, y: 51.5014 },
  { x: 56.0252, y: 71.7366 },
  { x: 41.5493, y: 92.3655 },
  { x: 70.7299, y: 92.2041 }
];

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

class GroupProfile {
  constructor(groupId, dimension) {
    this.groupId = groupId;
    this.sum = new Float32Array(dimension);
    this.count = 0;
  }

  addEmbedding(embedding) {
    if (!embedding || embedding.length !== this.sum.length) {
      return;
    }
    for (let i = 0; i < this.sum.length; i++) {
      this.sum[i] += embedding[i];
    }
    this.count += 1;
  }

  score(embedding) {
    if (!embedding || this.count === 0) return 0;
    return cosineSimilarity(this.getCentroid(), embedding);
  }

  getCentroid() {
    const centroid = new Float32Array(this.sum.length);
    if (this.count === 0) {
      return centroid;
    }
    for (let i = 0; i < this.sum.length; i++) {
      centroid[i] = this.sum[i] / this.count;
    }
    return centroid;
  }

  mergeFrom(otherProfile) {
    if (!otherProfile || otherProfile.sum.length !== this.sum.length || otherProfile.count === 0) {
      return;
    }
    for (let i = 0; i < this.sum.length; i++) {
      this.sum[i] += otherProfile.sum[i];
    }
    this.count += otherProfile.count;
  }
}

class PersonIndexingService {
  constructor() {
    this.groupCounter = 0;
    this.embeddingService = new FaceEmbeddingService();
    this.detectionService = new FaceDetectionService();
    this.imageProcessor = ImageProcessor;
  }

  createGroupId() {
    this.groupCounter += 1;
    return `${DEFAULT_GROUP_PREFIX}_${Date.now().toString(36)}_${this.groupCounter.toString(36)}`;
  }

  async indexSinglePersonImages(options = {}) {
    const {
      images = null,
      onProgress = null,
      source = 'face-embedding',
      threshold = null
    } = options;

    const settings = await UnifiedDataService.readSettings();
    const storedThreshold = settings.personIndexSimilarityThreshold;
    const similarityThreshold = this._normalizeSimilarityThreshold(
      typeof threshold === 'number' ? threshold : storedThreshold
    );

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

    await this.embeddingService.initialize();
    await this.detectionService.initialize();

    if (!this.embeddingService.isReady() || !this.detectionService.isReady()) {
      logger.warn('⚠️ 人脸模型不可用，跳过人物分组');
      return {
        processedCount: 0,
        assignedCount: 0,
        skippedCount: allSinglePersonImages.length,
        totalSinglePerson: allSinglePersonImages.length
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

    const embeddingCache = new Map();
    const faceCache = new Map();
    const profiles = new Map();
    const currentAssignments = new Map(existingAssignments);
    const personScores = new Map(
      Object.entries(existingPersonData || {}).map(([imageId, data]) => [imageId, data?.person_score ?? 0])
    );
    let embeddingDimension = null;

    const buildEmbedding = async (image) => {
      if (!image || !image.id) return null;
      if (embeddingCache.has(image.id)) {
        return embeddingCache.get(image.id);
      }
      const imageUri = getUri(image);
      if (!imageUri) {
        logger.warn(`👤 [人物分组] 跳过：无法获取图片URI imageId=${image?.id}, fileName=${image?.fileName}`);
        return null;
      }

      let faceResult = faceCache.get(image.id);
      if (!faceResult) {
        faceResult = await this.detectionService.detectPrimaryFace(imageUri);
        faceCache.set(image.id, faceResult || null);
      }

      if (!faceResult || !faceResult.box) {
        logger.warn(`👤 [人物分组] 未检测到有效人脸 imageId=${image.id}, fileName=${image.fileName || 'unknown'}`);
        return null;
      }

      const originalPixelData = await this.imageProcessor.getPixelData(
        imageUri,
        faceResult.imageWidth,
        faceResult.imageHeight,
        { mode: 'stretch' }
      );
      const cropped = Array.isArray(faceResult.keypoints) && faceResult.keypoints.length === 5
        ? this._alignFaceByKeypoints(
            originalPixelData,
            faceResult.imageWidth,
            faceResult.imageHeight,
            faceResult.keypoints,
            this.embeddingService.inputSize
          )
        : this._cropAndResizeFace(
            originalPixelData,
            faceResult.imageWidth,
            faceResult.imageHeight,
            faceResult.box,
            this.embeddingService.inputSize
          );
      if (!cropped) {
        logger.warn(`👤 [人物分组] 人脸裁剪失败 imageId=${image.id}, fileName=${image.fileName || 'unknown'}`);
        return null;
      }

      const embedding = await this.embeddingService.extractEmbeddingFromPixelData(
        cropped,
        this.embeddingService.inputSize,
        this.embeddingService.inputSize
      );
      if (embedding) {
        embeddingCache.set(image.id, embedding);
        logger.debug(`👤 [人物分组] Embedding成功 imageId=${image.id}, fileName=${image.fileName || 'unknown'}, dim=${embedding.length}`);
      } else {
        logger.warn(`👤 [人物分组] Embedding失败 imageId=${image.id}, fileName=${image.fileName || 'unknown'}`);
      }
      return embedding;
    };

    for (const [imageId, groupId] of existingAssignments.entries()) {
      const image = imageById.get(imageId);
      if (!image) continue;
      const embedding = await buildEmbedding(image);
      if (!embedding) continue;
      if (!embeddingDimension) {
        embeddingDimension = embedding.length;
      }
      if (!profiles.has(groupId)) {
        profiles.set(groupId, new GroupProfile(groupId, embedding.length));
      }
      profiles.get(groupId).addEmbedding(embedding);
    }

    const updates = [];
    let processedCount = 0;
    let skippedCount = 0;

    for (const image of candidates) {
      processedCount += 1;
      const embedding = await buildEmbedding(image);
      if (!embedding) {
        skippedCount += 1;
        logger.warn(`👤 [人物分组] 跳过图片 imageId=${image.id}, fileName=${image.fileName || 'unknown'}, processed=${processedCount}/${candidates.length}`);
        if (typeof onProgress === 'function') {
          onProgress(processedCount, candidates.length);
        }
        continue;
      }

      if (!embeddingDimension) {
        embeddingDimension = embedding.length;
      }

      let bestGroupId = null;
      let bestScore = 0;

      profiles.forEach(profile => {
        const score = profile.score(embedding);
        if (score > bestScore) {
          bestScore = score;
          bestGroupId = profile.groupId;
        }
      });

      let assignedGroupId = bestGroupId;
      let assignedScore = bestScore;
      if (!assignedGroupId || bestScore < similarityThreshold) {
        const reason = !bestGroupId ? 'no_match_group' : 'score_below_threshold';
        logger.debug(
          `👤 [人物分组] 新建分组 imageId=${image.id}, fileName=${image.fileName || 'unknown'}, ` +
          `reason=${reason}, bestGroupId=${bestGroupId || 'none'}, bestScore=${bestScore.toFixed(4)}, threshold=${similarityThreshold.toFixed(4)}`
        );
        assignedGroupId = this.createGroupId();
        assignedScore = 1;
      }

      if (!profiles.has(assignedGroupId)) {
        profiles.set(assignedGroupId, new GroupProfile(assignedGroupId, embedding.length));
      }
      profiles.get(assignedGroupId).addEmbedding(embedding);

      updates.push({
        imageId: image.id,
        personGroupId: assignedGroupId,
        personScore: assignedScore,
        personSource: source
      });
      currentAssignments.set(image.id, assignedGroupId);
      personScores.set(image.id, assignedScore);

      logger.debug(
        `👤 [人物分组] 归组成功 imageId=${image.id}, fileName=${image.fileName || 'unknown'}, ` +
        `groupId=${assignedGroupId}, score=${assignedScore.toFixed(4)}, matched=${bestGroupId ? 'yes' : 'no'}`
      );

      if (typeof onProgress === 'function') {
        onProgress(processedCount, candidates.length);
      }
    }

    const groupRemap = this._mergeSimilarGroups(profiles, similarityThreshold);
    this._applyGroupRemapToAssignments(currentAssignments, groupRemap);

    const memberReassignRemap = this._mergeSmallGroupsByMemberSimilarity(
      currentAssignments,
      embeddingCache,
      similarityThreshold
    );
    this._applyGroupRemapToAssignments(currentAssignments, memberReassignRemap);

    const finalUpdates = [];
    currentAssignments.forEach((groupId, imageId) => {
      const originalGroupId = existingAssignments.get(imageId);
      if (originalGroupId === groupId) {
        return;
      }
      finalUpdates.push({
        imageId,
        personGroupId: groupId,
        personScore: personScores.get(imageId),
        personSource: source
      });
    });

    if (finalUpdates.length > 0) {
      await UnifiedDataService.updateImagesPersonGrouping(finalUpdates, { refreshCache: false });
    }

    logger.info(
      `👤 人物分组完成: 总单人照片=${allSinglePersonImages.length}, 候选=${candidates.length}, ` +
      `已有分组=${existingAssignments.size}, 成功归组=${finalUpdates.length}, 跳过=${skippedCount}, 阈值=${similarityThreshold}`
    );

    return {
      processedCount: candidates.length,
      assignedCount: updates.length,
      skippedCount: skippedCount + (allSinglePersonImages.length - candidates.length),
      totalSinglePerson: allSinglePersonImages.length
    };
  }

  _cropAndResizeFace(pixelData, width, height, box, targetSize) {
    if (!pixelData || !box) return null;
    const x1 = Math.max(0, Math.min(width, box.x1));
    const y1 = Math.max(0, Math.min(height, box.y1));
    const x2 = Math.max(0, Math.min(width, box.x2));
    const y2 = Math.max(0, Math.min(height, box.y2));

    const cropW = Math.max(1, x2 - x1);
    const cropH = Math.max(1, y2 - y1);

    const resized = new Uint8ClampedArray(targetSize * targetSize * 4);
    for (let y = 0; y < targetSize; y++) {
      const srcY = Math.floor(y1 + (y / targetSize) * cropH);
      for (let x = 0; x < targetSize; x++) {
        const srcX = Math.floor(x1 + (x / targetSize) * cropW);
        const srcIndex = (srcY * width + srcX) * 4;
        const dstIndex = (y * targetSize + x) * 4;
        resized[dstIndex] = pixelData[srcIndex];
        resized[dstIndex + 1] = pixelData[srcIndex + 1];
        resized[dstIndex + 2] = pixelData[srcIndex + 2];
        resized[dstIndex + 3] = pixelData[srcIndex + 3];
      }
    }

    return resized;
  }

  _alignFaceByKeypoints(pixelData, width, height, keypoints, targetSize) {
    if (!pixelData || !Array.isArray(keypoints) || keypoints.length !== 5) {
      return null;
    }

    const template = this._getAlignmentTemplate(targetSize);
    const transform = this._estimateSimilarityTransform(keypoints, template);
    if (!transform) {
      return null;
    }

    const inverse = this._invertSimilarityTransform(transform);
    if (!inverse) {
      return null;
    }

    const aligned = new Uint8ClampedArray(targetSize * targetSize * 4);
    for (let y = 0; y < targetSize; y++) {
      for (let x = 0; x < targetSize; x++) {
        const source = this._applySimilarityTransform(inverse, x, y);
        const rgba = this._sampleBilinear(pixelData, width, height, source.x, source.y);
        const dstIndex = (y * targetSize + x) * 4;
        aligned[dstIndex] = rgba[0];
        aligned[dstIndex + 1] = rgba[1];
        aligned[dstIndex + 2] = rgba[2];
        aligned[dstIndex + 3] = rgba[3];
      }
    }

    return aligned;
  }

  _getAlignmentTemplate(targetSize) {
    const scale = targetSize / this.embeddingService.inputSize;
    return ARCFACE_TEMPLATE_112.map(point => ({
      x: point.x * scale,
      y: point.y * scale
    }));
  }

  _estimateSimilarityTransform(sourcePoints, destinationPoints) {
    if (!Array.isArray(sourcePoints) || !Array.isArray(destinationPoints) || sourcePoints.length !== destinationPoints.length || sourcePoints.length < 2) {
      return null;
    }

    const rows = [];
    const values = [];
    for (let i = 0; i < sourcePoints.length; i++) {
      const src = sourcePoints[i];
      const dst = destinationPoints[i];
      rows.push([src.x, -src.y, 1, 0]);
      values.push(dst.x);
      rows.push([src.y, src.x, 0, 1]);
      values.push(dst.y);
    }

    const normalMatrix = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    const normalVector = [0, 0, 0, 0];

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const value = values[rowIndex];
      for (let i = 0; i < 4; i++) {
        normalVector[i] += row[i] * value;
        for (let j = 0; j < 4; j++) {
          normalMatrix[i][j] += row[i] * row[j];
        }
      }
    }

    const solution = this._solveLinearSystem(normalMatrix, normalVector);
    if (!solution) {
      return null;
    }

    const [a, b, tx, ty] = solution;
    return { a, b, tx, ty };
  }

  _solveLinearSystem(matrix, vector) {
    const size = vector.length;
    const augmented = matrix.map((row, index) => [...row, vector[index]]);

    for (let pivot = 0; pivot < size; pivot++) {
      let maxRow = pivot;
      for (let row = pivot + 1; row < size; row++) {
        if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) {
          maxRow = row;
        }
      }

      if (Math.abs(augmented[maxRow][pivot]) < 1e-8) {
        return null;
      }

      if (maxRow !== pivot) {
        const temp = augmented[pivot];
        augmented[pivot] = augmented[maxRow];
        augmented[maxRow] = temp;
      }

      const pivotValue = augmented[pivot][pivot];
      for (let col = pivot; col <= size; col++) {
        augmented[pivot][col] /= pivotValue;
      }

      for (let row = 0; row < size; row++) {
        if (row === pivot) continue;
        const factor = augmented[row][pivot];
        if (factor === 0) continue;
        for (let col = pivot; col <= size; col++) {
          augmented[row][col] -= factor * augmented[pivot][col];
        }
      }
    }

    return augmented.map(row => row[size]);
  }

  _invertSimilarityTransform(transform) {
    if (!transform) return null;
    const { a, b, tx, ty } = transform;
    const det = a * a + b * b;
    if (det < 1e-8) {
      return null;
    }

    return {
      a: a / det,
      b: -b / det,
      tx: (-a * tx - b * ty) / det,
      ty: (b * tx - a * ty) / det
    };
  }

  _applySimilarityTransform(transform, x, y) {
    return {
      x: transform.a * x - transform.b * y + transform.tx,
      y: transform.b * x + transform.a * y + transform.ty
    };
  }

  _sampleBilinear(pixelData, width, height, x, y) {
    const clampedX = Math.min(width - 1, Math.max(0, x));
    const clampedY = Math.min(height - 1, Math.max(0, y));
    const x0 = Math.floor(clampedX);
    const y0 = Math.floor(clampedY);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const dx = clampedX - x0;
    const dy = clampedY - y0;

    const c00 = this._getPixel(pixelData, width, x0, y0);
    const c10 = this._getPixel(pixelData, width, x1, y0);
    const c01 = this._getPixel(pixelData, width, x0, y1);
    const c11 = this._getPixel(pixelData, width, x1, y1);

    const rgba = [0, 0, 0, 255];
    for (let i = 0; i < 4; i++) {
      const top = c00[i] * (1 - dx) + c10[i] * dx;
      const bottom = c01[i] * (1 - dx) + c11[i] * dx;
      rgba[i] = Math.round(top * (1 - dy) + bottom * dy);
    }

    return rgba;
  }

  _getPixel(pixelData, width, x, y) {
    const index = (y * width + x) * 4;
    return [
      pixelData[index],
      pixelData[index + 1],
      pixelData[index + 2],
      pixelData[index + 3]
    ];
  }

  _mergeSimilarGroups(profiles, similarityThreshold) {
    const groupRemap = new Map();
    const mergeThreshold = Math.max(
      MIN_GROUP_MERGE_THRESHOLD,
      similarityThreshold - DEFAULT_GROUP_MERGE_OFFSET
    );
    const smallGroupMergeThreshold = Math.max(
      MIN_SMALL_GROUP_MERGE_THRESHOLD,
      similarityThreshold - SMALL_GROUP_RELAXED_OFFSET
    );

    while (true) {
      const activeProfiles = Array.from(profiles.values()).filter(profile => profile && profile.count > 0);
      let bestPair = null;
      let bestScore = mergeThreshold;
      let bestPairThreshold = mergeThreshold;
      let bestPairMode = 'default';

      for (let i = 0; i < activeProfiles.length; i++) {
        for (let j = i + 1; j < activeProfiles.length; j++) {
          const left = activeProfiles[i];
          const right = activeProfiles[j];
          const score = cosineSimilarity(left.getCentroid(), right.getCentroid());
          const pairThreshold = this._getPairMergeThreshold(
            left,
            right,
            mergeThreshold,
            smallGroupMergeThreshold
          );
          if (score > bestScore && score >= pairThreshold) {
            bestScore = score;
            bestPair = [left, right];
            bestPairThreshold = pairThreshold;
            bestPairMode = pairThreshold < mergeThreshold ? 'small_group_relaxed' : 'default';
          }
        }
      }

      if (!bestPair) {
        break;
      }

      const [left, right] = bestPair;
      const keep = left.count >= right.count ? left : right;
      const absorb = keep === left ? right : left;
      keep.mergeFrom(absorb);
      profiles.delete(absorb.groupId);
      groupRemap.set(absorb.groupId, keep.groupId);

      for (const [groupId, mappedGroupId] of Array.from(groupRemap.entries())) {
        if (mappedGroupId === absorb.groupId) {
          groupRemap.set(groupId, keep.groupId);
        }
      }

      logger.debug(
        `👤 [人物分组] 合并分组 keep=${keep.groupId}, absorb=${absorb.groupId}, ` +
        `score=${bestScore.toFixed(4)}, mergeThreshold=${bestPairThreshold.toFixed(4)}, mode=${bestPairMode}, ` +
        `keepCount=${keep.count}, absorbCount=${absorb.count}`
      );
    }

    return groupRemap;
  }

  _mergeSmallGroupsByMemberSimilarity(assignments, embeddingCache, similarityThreshold) {
    const groupRemap = new Map();
    const perMemberThreshold = Math.max(
      MIN_MEMBER_REASSIGN_THRESHOLD,
      similarityThreshold - MEMBER_REASSIGN_OFFSET
    );
    const averageThreshold = Math.max(
      MIN_MEMBER_REASSIGN_AVG_THRESHOLD,
      similarityThreshold - MEMBER_REASSIGN_AVG_OFFSET
    );

    while (true) {
      const groupMembers = this._buildGroupMembers(assignments, embeddingCache);
      let bestCandidate = null;

      for (const [sourceGroupId, sourceMembers] of groupMembers.entries()) {
        if (!sourceMembers || sourceMembers.length === 0 || sourceMembers.length > MEMBER_REASSIGN_SOURCE_MAX_SIZE) {
          continue;
        }

        const reassignThresholds = this._getMemberReassignThresholds(similarityThreshold, sourceMembers.length);
        let sourceBestCandidate = null;
        let sourceBestAttempt = null;
        for (const [targetGroupId, targetMembers] of groupMembers.entries()) {
          if (
            targetGroupId === sourceGroupId ||
            !targetMembers ||
            targetMembers.length < MEMBER_REASSIGN_TARGET_MIN_SIZE
          ) {
            continue;
          }

          const attempt = this._scoreSmallGroupAgainstTarget(
            sourceMembers,
            targetMembers
          );
          if (!attempt) {
            continue;
          }

          if (!sourceBestAttempt || attempt.averageScore > sourceBestAttempt.averageScore) {
            sourceBestAttempt = {
              targetGroupId,
              ...attempt
            };
          }

          const evaluation = this._evaluateMemberReassignAttempt(attempt, reassignThresholds);
          if (!evaluation) {
            continue;
          }

          if (!sourceBestCandidate || evaluation.averageScore > sourceBestCandidate.averageScore) {
            sourceBestCandidate = {
              targetGroupId,
              ...evaluation
            };
          }

          if (!bestCandidate || evaluation.averageScore > bestCandidate.averageScore) {
            bestCandidate = {
              sourceGroupId,
              targetGroupId,
              ...evaluation
            };
          }
        }

        if (!sourceBestCandidate) {
          logger.debug(
            `👤 [人物分组] 成员重分配未命中 source=${sourceGroupId}, sourceCount=${sourceMembers.length}, ` +
            `memberThreshold=${reassignThresholds.perMemberThreshold.toFixed(4)}, ` +
            `averageThreshold=${reassignThresholds.averageThreshold.toFixed(4)}, ` +
            `bestTarget=${sourceBestAttempt?.targetGroupId || 'none'}, ` +
            `bestAvgScore=${sourceBestAttempt?.averageScore?.toFixed ? sourceBestAttempt.averageScore.toFixed(4) : 'n/a'}, ` +
            `bestMinScore=${sourceBestAttempt?.minScore?.toFixed ? sourceBestAttempt.minScore.toFixed(4) : 'n/a'}, ` +
            `bestScores=${sourceBestAttempt?.memberScores ? sourceBestAttempt.memberScores.map(score => score.toFixed(4)).join(',') : 'n/a'}`
          );
        } else {
          logger.debug(
            `👤 [人物分组] 成员重分配候选 source=${sourceGroupId}, target=${sourceBestCandidate.targetGroupId}, ` +
            `sourceCount=${sourceMembers.length}, avgScore=${sourceBestCandidate.averageScore.toFixed(4)}, ` +
            `minScore=${sourceBestCandidate.minScore.toFixed(4)}, ` +
            `scores=${sourceBestCandidate.memberScores.map(score => score.toFixed(4)).join(',')}`
          );
        }
      }

      if (!bestCandidate) {
        break;
      }

      groupRemap.set(bestCandidate.sourceGroupId, bestCandidate.targetGroupId);
      this._applyGroupRemapToAssignments(assignments, new Map([[bestCandidate.sourceGroupId, bestCandidate.targetGroupId]]));
      logger.debug(
        `👤 [人物分组] 成员重分配 keep=${bestCandidate.targetGroupId}, absorb=${bestCandidate.sourceGroupId}, ` +
        `avgScore=${bestCandidate.averageScore.toFixed(4)}, minScore=${bestCandidate.minScore.toFixed(4)}, ` +
        `memberThreshold=${bestCandidate.perMemberThreshold.toFixed(4)}, averageThreshold=${bestCandidate.averageThreshold.toFixed(4)}, ` +
        `scores=${bestCandidate.memberScores.map(score => score.toFixed(4)).join(',')}`
      );
    }

    return groupRemap;
  }

  _buildGroupMembers(assignments, embeddingCache) {
    const groupMembers = new Map();
    assignments.forEach((groupId, imageId) => {
      const embedding = embeddingCache.get(imageId);
      if (!groupId || !embedding) {
        return;
      }
      if (!groupMembers.has(groupId)) {
        groupMembers.set(groupId, []);
      }
      groupMembers.get(groupId).push({ imageId, embedding });
    });
    return groupMembers;
  }

  _scoreSmallGroupAgainstTarget(sourceMembers, targetMembers) {
    const memberScores = [];

    for (const sourceMember of sourceMembers) {
      let bestScore = 0;
      for (const targetMember of targetMembers) {
        const score = cosineSimilarity(sourceMember.embedding, targetMember.embedding);
        if (score > bestScore) {
          bestScore = score;
        }
      }

      memberScores.push(bestScore);
    }

    const averageScore = memberScores.reduce((sum, score) => sum + score, 0) / memberScores.length;
    return {
      averageScore,
      minScore: Math.min(...memberScores),
      memberScores
    };
  }

  _evaluateMemberReassignAttempt(attempt, thresholds) {
    if (!attempt || !thresholds) {
      return null;
    }

    if (thresholds.singleMemberOnly) {
      if (attempt.minScore < thresholds.perMemberThreshold) {
        return null;
      }
      return {
        ...attempt,
        perMemberThreshold: thresholds.perMemberThreshold,
        averageThreshold: thresholds.averageThreshold
      };
    }

    if (attempt.minScore < thresholds.perMemberThreshold) {
      return null;
    }
    if (attempt.averageScore < thresholds.averageThreshold) {
      return null;
    }

    return {
      ...attempt,
      perMemberThreshold: thresholds.perMemberThreshold,
      averageThreshold: thresholds.averageThreshold
    };
  }

  _getMemberReassignThresholds(similarityThreshold, sourceCount) {
    if (sourceCount === 1) {
      return {
        perMemberThreshold: Math.max(
          MIN_SINGLE_MEMBER_REASSIGN_THRESHOLD,
          similarityThreshold - SINGLE_MEMBER_REASSIGN_OFFSET
        ),
        averageThreshold: Math.max(
          MIN_SINGLE_MEMBER_REASSIGN_AVG_THRESHOLD,
          similarityThreshold - SINGLE_MEMBER_REASSIGN_AVG_OFFSET
        ),
        singleMemberOnly: true
      };
    }

    return {
      perMemberThreshold: Math.max(
        MIN_MEMBER_REASSIGN_THRESHOLD,
        similarityThreshold - MEMBER_REASSIGN_OFFSET
      ),
      averageThreshold: Math.max(
        MIN_MEMBER_REASSIGN_AVG_THRESHOLD,
        similarityThreshold - MEMBER_REASSIGN_AVG_OFFSET
      ),
      singleMemberOnly: false
    };
  }

  _applyGroupRemapToAssignments(assignments, groupRemap) {
    if (!assignments || !groupRemap || groupRemap.size === 0) {
      return;
    }

    assignments.forEach((groupId, imageId) => {
      assignments.set(imageId, this._resolveGroupId(groupId, groupRemap));
    });
  }

  _getPairMergeThreshold(left, right, defaultThreshold, smallGroupThreshold) {
    const smallerCount = Math.min(left?.count || 0, right?.count || 0);
    if (smallerCount > 0 && smallerCount <= SMALL_GROUP_MAX_SIZE) {
      return Math.min(defaultThreshold, smallGroupThreshold);
    }
    return defaultThreshold;
  }

  _resolveGroupId(groupId, groupRemap) {
    if (!groupId || !groupRemap || groupRemap.size === 0) {
      return groupId;
    }

    let resolved = groupId;
    const visited = new Set();
    while (groupRemap.has(resolved) && !visited.has(resolved)) {
      visited.add(resolved);
      resolved = groupRemap.get(resolved);
    }
    return resolved;
  }

  _normalizeSimilarityThreshold(value) {
    if (typeof value !== 'number') {
      return DEFAULT_SIMILARITY_THRESHOLD;
    }
    if (value === LEGACY_DEFAULT_SIMILARITY_THRESHOLD) {
      return DEFAULT_SIMILARITY_THRESHOLD;
    }
    return value;
  }
}

export default PersonIndexingService;
