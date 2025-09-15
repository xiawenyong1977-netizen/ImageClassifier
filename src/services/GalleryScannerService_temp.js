import { Platform } from 'react-native';
import { PermissionsAndroid } from '../adapters/WebAdapters';
import { RNFS } from '../adapters/WebAdapters';
import ImageClassifierService from './ImageClassifierService';

// EXIF浣嶇疆淇℃伅璇诲彇鍑芥暟 - 绠€鍖栫増 ?
const extractLocationInfo = async (filePath) => {
  try {
    console.log(`馃攳 灏濊瘯浠庢枃 ?${filePath.split('/').pop()} 璇诲彇EXIF浣嶇疆淇℃伅...`);
    
    // 浣跨敤 React Native 鐨勫師鐢熻兘鍔涜鍙栨枃浠朵俊 ?
    const RNFS = require('react-native-fs');
    
    try {
      // 璇诲彇鏂囦欢鐨勫熀鏈俊 ?
      const stats = await RNFS.stat(filePath);
      console.log(`馃摳 鏂囦欢淇℃伅:`, stats);
      
      // 鍒濆鍖栦綅缃俊鎭 ?
      const locationInfo = {};
      
      // 灏濊瘯浣跨敤 EXIF 搴撹鍙栦綅缃俊 ?
      try {
        console.log(`馃攧 灏濊瘯浣跨敤exif-parser搴撹鍙朑PS淇℃伅...`);
        const ExifParser = require('exif-parser');
        const Buffer = require('buffer').Buffer;
        
        // 璇诲彇鏁翠釜鏂囦欢鏉ヨВ鏋怑XIF鏁版嵁
        const buffer = await RNFS.read(filePath, 0, 0, 'base64');
        const arrayBuffer = Buffer.from(buffer, 'base64');
        
        const parser = ExifParser.create(arrayBuffer);
        const exifData = parser.parse();
        console.log(`馃摳 EXIF鏁版嵁璇诲彇鎴愬姛:`, exifData);
        
        if (exifData && exifData.tags) {
          // 杈撳嚭鎵€鏈塆PS鐩稿叧鏍囩鐢ㄤ簬璋冭瘯
          const gpsTags = Object.keys(exifData.tags).filter(tag => 
            tag.toLowerCase().includes('gps') || 
            tag.toLowerCase().includes('lat') || 
            tag.toLowerCase().includes('lon')
          );
          console.log(`馃攳 鎵惧埌GPS鐩稿叧鏍囩:`, gpsTags);
          gpsTags.forEach(tag => {
            console.log(`  ${tag}: ${exifData.tags[tag]} (${typeof exifData.tags[tag]})`);
          });
          
          // 鎻愬彇GPS鍧愭爣淇℃伅锛堝潗鏍囧凡缁忔槸鍗佽繘鍒跺害鏍煎紡 ?
          if (exifData.tags.GPSLatitude && exifData.tags.GPSLongitude) {
            locationInfo.latitude = exifData.tags.GPSLatitude;
            locationInfo.longitude = exifData.tags.GPSLongitude;
            locationInfo.source = 'exif';
            console.log(` ?EXIF鎵惧埌GPS鍧愭爣: ${locationInfo.latitude}, ${locationInfo.longitude}`);
            
            // 鎻愬彇娴锋嫈楂樺害
            if (exifData.tags.GPSAltitude) {
              locationInfo.altitude = exifData.tags.GPSAltitude;
              console.log(` ?EXIF鎵惧埌娴锋嫈楂樺害: ${locationInfo.altitude}`);
            }
            
            // 鎻愬彇GPS绮惧害锛堝鏋滃瓨鍦級
            if (exifData.tags.GPSHPositioningError) {
              locationInfo.accuracy = exifData.tags.GPSHPositioningError;
              console.log(` ?EXIF鎵惧埌GPS绮惧害: ${locationInfo.accuracy}`);
            }
            
            return locationInfo;
          } else {
            console.log(` ?EXIF涓湭鎵惧埌GPS鍧愭爣鏁版嵁`);
            console.log(`GPSLatitude: ${exifData.tags.GPSLatitude}`);
            console.log(`GPSLongitude: ${exifData.tags.GPSLongitude}`);
          }
        } else {
          console.log(` ?EXIF鏁版嵁瑙ｆ瀽澶辫触鎴栨病鏈塼ags`);
        }
        
      } catch (exifError) {
        console.log(`鈿狅笍 exif-parser璇诲彇澶辫触:`, exifError.message);
      }

      // 灏濊瘯浣跨敤鍘熺敓 ?
      try {
        console.log(`馃攧 灏濊瘯浣跨敤react-native-exif鍘熺敓 ?..`);
        const RNExif = require('react-native-exif');
        
        const exifData = await RNExif.getExif(filePath);
        console.log(`馃摳 鍘熺敓搴揈XIF鏁版嵁:`, exifData);
        
        // 鎻愬彇GPS鍧愭爣淇℃伅
        if (exifData.GPSLatitude && exifData.GPSLongitude) {
          locationInfo.latitude = parseFloat(exifData.GPSLatitude);
          locationInfo.longitude = parseFloat(exifData.GPSLongitude);
          locationInfo.source = 'exif';
          console.log(` ?鍘熺敓搴撴壘鍒癎PS鍧愭爣: ${locationInfo.latitude}, ${locationInfo.longitude}`);
          
          // 鎻愬彇娴锋嫈楂樺害
          if (exifData.GPSAltitude) {
            locationInfo.altitude = parseFloat(exifData.GPSAltitude);
            console.log(` ?鍘熺敓搴撴壘鍒版捣鎷旈珮 ? ${locationInfo.altitude}`);
          }
          
          // 鎻愬彇GPS绮惧害锛堝鏋滃瓨鍦級
          if (exifData.GPSHPositioningError) {
            locationInfo.accuracy = parseFloat(exifData.GPSHPositioningError);
            console.log(` ?鍘熺敓搴撴壘鍒癎PS绮惧害: ${locationInfo.accuracy}`);
          }
          
          return locationInfo;
        } else {
          console.log(` ?鍘熺敓搴撲腑鏈壘鍒癎PS鍧愭爣鏁版嵁`);
          console.log(`GPSLatitude: ${exifData.GPSLatitude}`);
          console.log(`GPSLongitude: ${exifData.GPSLongitude}`);
        }
        
      } catch (nativeError) {
        console.log(`鈿狅笍 鍘熺敓搴撹鍙栧け ?`, nativeError.message);
      }
      
                  // MediaStore  ?React Native 涓笉鍙敤锛岃烦杩囨姝ラ
      
      // 濡傛灉閮芥病鏈夋壘鍒帮紝杩斿洖榛樿鐨勪綅缃俊鎭粨 ?
      console.log(`鈿狅笍 鏈壘鍒癎PS浣嶇疆淇℃伅锛屼娇鐢ㄩ粯璁ょ粨鏋刞);
      return {
        latitude: null,
        longitude: null,
        altitude: null,
        accuracy: null,
        address: null,
        city: null,
        country: null,
        province: null,
        district: null,
        street: null,
        source: 'none'
      };
      
    } catch (fileError) {
      console.log(`鈿狅笍 鏂囦欢璇诲彇澶辫触:`, fileError.message);
      return null;
    }
    
  } catch (error) {
    console.error(` ?浣嶇疆淇℃伅璇诲彇瀹屽叏澶辫触:`, error);
    return null;
  }
};

// EXIF鎷嶆憚鏃堕棿璇诲彇鍑芥暟
const extractTakenTime = async (filePath) => {
  try {
    // 浼樺厛浣跨敤澶囩敤EXIF搴擄紙exif-parser锛夛紝鍥犱负瀹冩洿绋冲畾
    console.log(`馃攳 灏濊瘯浠庢枃 ?${filePath.split('/').pop()} 璇诲彇EXIF鎷嶆憚鏃堕棿...`);
    
    try {
      console.log(`馃攧 浣跨敤exif-parser搴撹鍙朎XIF鏁版嵁...`);
      const ExifParser = require('exif-parser');
      const RNFS = require('react-native-fs');
      const Buffer = require('buffer').Buffer;
      
      // 璇诲彇鏂囦欢鐨勫墠64KB鏉ヨВ鏋怑XIF鏁版嵁
      const buffer = await RNFS.read(filePath, 65536, 0, 'base64');
      const arrayBuffer = Buffer.from(buffer, 'base64');
      
      const parser = ExifParser.create(arrayBuffer);
      const exifData = parser.parse();
      console.log(`馃摳 EXIF鏁版嵁璇诲彇鎴愬姛:`, exifData);
      
      if (exifData && exifData.tags && exifData.tags.DateTimeOriginal) {
        const takenDate = new Date(exifData.tags.DateTimeOriginal * 1000);
        console.log(` ?鎵惧埌鎷嶆憚鏃堕棿: ${takenDate.toLocaleString('zh-CN')}`);
        return takenDate.getTime();
      }
      
      if (exifData && exifData.tags && exifData.tags.DateTime) {
        const takenDate = new Date(exifData.tags.DateTime * 1000);
        console.log(` ?鎵惧埌淇敼鏃堕棿: ${takenDate.toLocaleString('zh-CN')}`);
        return takenDate.getTime();
      }
      
      console.log(`鈿狅笍 鏂囦欢涓病鏈夋壘鍒版媿鎽勬椂闂翠俊鎭痐);
      return null;
      
    } catch (parseError) {
      console.log(`鈿狅笍 exif-parser瑙ｆ瀽澶辫触:`, parseError.message);
      
      // 濡傛灉澶囩敤搴撳け璐ワ紝灏濊瘯浣跨敤鍘熺敓搴撲綔涓烘渶鍚庢墜 ?
      try {
        console.log(`馃攧 灏濊瘯浣跨敤react-native-exif鍘熺敓 ?..`);
        const RNExif = require('react-native-exif');
        
        const exifData = await RNExif.getExif(filePath);
        console.log(`馃摳 鍘熺敓搴揈XIF鏁版嵁:`, exifData);
        
        if (exifData && exifData.DateTimeOriginal) {
          const dateTimeStr = exifData.DateTimeOriginal;
          console.log(`馃搮 鍘熺敓搴撴壘鍒版媿鎽勬椂 ? ${dateTimeStr}`);
          
          // 瑙ｆ瀽鏃ユ湡鏃堕棿瀛楃 ?(鏍煎紡: "2023:09:15 14:23:45")
          const [datePart, timePart] = dateTimeStr.split(' ');
          const [year, month, day] = datePart.split(':');
          const [hour, minute, second] = timePart.split(':');
          
          const takenDate = new Date(
            parseInt(year),
            parseInt(month) - 1, // 鏈堜唤 ?寮€ ?
            parseInt(day),
            parseInt(hour),
            parseInt(minute),
            parseInt(second)
          );
          
          console.log(` ?鍘熺敓搴撴媿鎽勬椂闂磋В鏋愭垚 ? ${takenDate.toLocaleString('zh-CN')}`);
          return takenDate.getTime();
        }
        
        if (exifData && exifData.DateTime) {
          const dateTimeStr = exifData.DateTime;
          console.log(`馃搮 鍘熺敓搴撴壘鍒颁慨鏀规椂 ? ${dateTimeStr}`);
          
          // 瑙ｆ瀽鏃ユ湡鏃堕棿瀛楃 ?
          const [datePart, timePart] = dateTimeStr.split(' ');
          const [year, month, day] = datePart.split(':');
          const [hour, minute, second] = timePart.split(':');
          
          const takenDate = new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour),
            parseInt(minute),
            parseInt(second)
          );
          
          console.log(` ?鍘熺敓搴撲慨鏀规椂闂磋В鏋愭垚 ? ${takenDate.toLocaleString('zh-CN')}`);
          return takenDate.getTime();
        }
        
        console.log(`鈿狅笍 鍘熺敓搴撲篃鏈壘鍒版媿鎽勬椂闂翠俊鎭痐);
        return null;
        
      } catch (nativeError) {
        console.log(` ?鍘熺敓搴撲篃澶辫触:`, nativeError.message);
        return null;
      }
    }
    
  } catch (error) {
    console.error(` ?鎷嶆憚鏃堕棿璇诲彇瀹屽叏澶辫触:`, error);
    return null;
  }
};
import ImageStorageService from './ImageStorageService';

class GalleryScannerService {
  constructor() {
    this.isInitialized = false;
    
    // 鍒涘缓鏈嶅姟瀹炰緥
    this.imageClassifier = new ImageClassifierService();
    
    // 瀹氫箟鏈湴鐩稿唽璺緞 - 灏濊瘯澶氱鍙兘鐨勮矾 ?
    this.galleryPaths = [
      // Android 鏍囧噯璺緞
      '/storage/emulated/0/DCIM/Camera',           // 鐩告満鎷嶆憚鐨勭収 ?
      '/storage/emulated/0/DCIM/Screenshots',      // 鎴浘
      '/storage/emulated/0/Pictures',              // 鍥剧墖鏂囦欢 ?
      '/storage/emulated/0/Download',              // 涓嬭浇鏂囦欢 ?
      '/storage/emulated/0/WeChat/WeChat Images',  // 寰俊鍥剧墖
      '/storage/emulated/0/QQ_Images',             // QQ鍥剧墖
      '/storage/emulated/0/Telegram',              // Telegram鍥剧墖
      '/storage/emulated/0/WhatsApp/Media/WhatsApp Images', // WhatsApp鍥剧墖
      

    ];
  }

  // 鍒濆鍖栨湇 ?
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      // 鍦ㄥ疄闄呭簲鐢ㄤ腑锛岃繖閲屽簲璇ヨ姹傜浉鍐屾潈 ?
      // 骞跺垵濮嬪寲鐩稿叧鐨勫師鐢熸ā ?
      await this.requestPermissions();
      this.isInitialized = true;
      console.log('鐩稿唽鎵弿鏈嶅姟鍒濆鍖栨垚 ?);
    } catch (error) {
      console.error('鐩稿唽鎵弿鏈嶅姟鍒濆鍖栧け ?', error);
      throw error;
    }
  }

  // 璇锋眰蹇呰鐨勬潈 ?
  async requestPermissions() {
    if (Platform.OS === 'android') {
      try {
        console.log('馃攼 寮€濮嬫潈闄愭鏌ュ拰璇锋眰...');
        
        // 鑾峰彇Android API绾у埆
        const apiLevel = Platform.Version;
        console.log(`馃摫 妫€娴嬪埌Android API绾у埆: ${apiLevel}`);
        
        // 鎵撳嵃鎵€鏈夌浉鍏虫潈闄愮殑褰撳墠鐘??
        console.log('馃搵 褰撳墠鏉冮檺鐘舵€佹 ?');
        
        // 妫€鏌EAD_EXTERNAL_STORAGE鏉冮檺
        const hasReadStorage = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
        );
        console.log(`   馃搧 READ_EXTERNAL_STORAGE: ${hasReadStorage ? ' ?宸叉巿 ? : ' ?鏈巿 ?}`);
        
        // 妫€鏌RITE_EXTERNAL_STORAGE鏉冮檺
        const hasWriteStorage = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
        );
        console.log(`   馃摑 WRITE_EXTERNAL_STORAGE: ${hasWriteStorage ? ' ?宸叉巿 ? : ' ?鏈巿 ?}`);
        
        // 妫€鏌EAD_MEDIA_IMAGES鏉冮檺锛圓ndroid 13+ ?
        if (apiLevel >= 33) {
          const hasMediaImages = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
          );
          console.log(`   馃柤 ?READ_MEDIA_IMAGES: ${hasMediaImages ? ' ?宸叉巿 ? : ' ?鏈巿 ?}`);
        }
        
        // 妫€鏌AMERA鏉冮檺
        const hasCamera = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
        console.log(`   馃摲 CAMERA: ${hasCamera ? ' ?宸叉巿 ? : ' ?鏈巿 ?}`);
        
        console.log('馃搵 鏉冮檺鐘舵€佹鏌ュ畬鎴怽n');
        
        // 瀵逛簬 Android 13+ (API 33+)锛屼紭鍏堜娇 ?READ_MEDIA_IMAGES 鏉冮檺
        if (apiLevel >= 33) {
          console.log(' ?Android 13+ 妫€娴嬪埌锛屼娇 ?READ_MEDIA_IMAGES 鏉冮檺');
          
          // 鍏堟鏌ユ槸鍚﹀凡缁忔湁濯掍綋鏉冮檺
          const hasMediaPermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
          );
          
          console.log(`馃搵 READ_MEDIA_IMAGES 鏉冮檺鐘?? ${hasMediaPermission ? '宸叉巿 ? : '鏈巿 ?}`);
          
          if (hasMediaPermission) {
            console.log(' ?濯掍綋鏉冮檺宸插瓨鍦紝鏃犻渶璇锋眰');
            return;
          }
          
          console.log('馃攧 寮€濮嬭 ?READ_MEDIA_IMAGES 鏉冮檺...');
          
          // 璇锋眰濯掍綋鏉冮檺
          const mediaGranted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
            {
              title: '鐩稿唽鏉冮檺',
              message: '搴旂敤闇€瑕佽闂偍鐨勭浉鍐屾潵鎵弿鍜屽垎绫诲浘鐗囥€傝鍦ㄦ潈闄愬脊绐椾腑閫夋嫨"鍏佽" ?,
              buttonNeutral: '绋嶅悗璇㈤棶',
              buttonNegative: '鍙栨秷',
              buttonPositive: '纭畾',
            }
          );
          
          console.log(`馃搵 鏉冮檺璇锋眰缁撴灉: ${mediaGranted}`);
          
          if (mediaGranted === PermissionsAndroid.RESULTS.GRANTED) {
            console.log(' ?濯掍綋鏉冮檺宸叉巿 ?);
            return;
          } else if (mediaGranted === PermissionsAndroid.RESULTS.DENIED) {
            console.log(' ?濯掍綋鏉冮檺琚嫆缁濓紝璇锋墜鍔ㄦ巿浜堟潈 ?);
            throw new Error('鐩稿唽鏉冮檺琚嫆缁濓紝璇峰湪绯荤粺璁剧疆涓墜鍔ㄦ巿浜堢浉鍐屾潈 ?);
          } else {
            console.log('鈿狅笍 濯掍綋鏉冮檺璇锋眰琚彇 ?);
            throw new Error('鐩稿唽鏉冮檺璇锋眰琚彇娑堬紝璇峰湪绯荤粺璁剧疆涓墜鍔ㄦ巿浜堢浉鍐屾潈 ?);
          }
        } else {
          // 瀵逛簬 Android 12 鍙婁互涓嬬増鏈紝浣跨敤 READ_EXTERNAL_STORAGE 鏉冮檺
          console.log(' ?Android 12 鍙婁互涓嬬増鏈紝浣跨敤 READ_EXTERNAL_STORAGE 鏉冮檺');
          
          // 鍏堟鏌ユ槸鍚﹀凡缁忔湁瀛樺偍鏉冮檺
          const hasStoragePermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
          );
          
          console.log(`馃搵 READ_EXTERNAL_STORAGE 鏉冮檺鐘?? ${hasStoragePermission ? '宸叉巿 ? : '鏈巿 ?}`);
          
          if (hasStoragePermission) {
            console.log(' ?瀛樺偍鏉冮檺宸插瓨鍦紝鏃犻渶璇锋眰');
            return;
          }
          
          console.log('馃攧 寮€濮嬭 ?READ_EXTERNAL_STORAGE 鏉冮檺...');
          
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
            {
              title: '瀛樺偍鏉冮檺',
              message: '搴旂敤闇€瑕佽闂偍鐨勭浉鍐屾潵鎵弿鍜屽垎绫诲浘鐗囥€傝鍦ㄦ潈闄愬脊绐椾腑閫夋嫨"鍏佽" ?,
              buttonNeutral: '绋嶅悗璇㈤棶',
              buttonNegative: '鍙栨秷',
              buttonPositive: '纭畾',
            }
          );
          
          console.log(`馃搵 鏉冮檺璇锋眰缁撴灉: ${granted}`);
          
          if (granted === PermissionsAndroid.RESULTS.GRANTED) {
            console.log(' ?瀛樺偍鏉冮檺宸叉巿 ?);
          } else if (granted === PermissionsAndroid.RESULTS.DENIED) {
            console.log(' ?瀛樺偍鏉冮檺琚嫆缁濓紝璇锋墜鍔ㄦ巿浜堟潈 ?);
            throw new Error('瀛樺偍鏉冮檺琚嫆缁濓紝璇峰湪绯荤粺璁剧疆涓墜鍔ㄦ巿浜堝瓨鍌ㄦ潈 ?);
          } else {
            console.log('鈿狅笍 瀛樺偍鏉冮檺璇锋眰琚彇 ?);
            throw new Error('瀛樺偍鏉冮檺璇锋眰琚彇娑堬紝璇峰湪绯荤粺璁剧疆涓墜鍔ㄦ巿浜堝瓨鍌ㄦ潈 ?);
          }
        }
        
        // 灏濊瘯璇锋眰楂樼骇鏉冮檺锛堢敤浜庡垹闄ゆ枃浠讹級
        console.log('馃攧 灏濊瘯璇锋眰楂樼骇鏉冮檺...');
        
        // 璇锋眰WRITE_EXTERNAL_STORAGE鏉冮檺锛堝嵆浣垮彲鑳芥棤鏁堬級
        if (!hasWriteStorage) {
          console.log('馃攧 璇锋眰 WRITE_EXTERNAL_STORAGE 鏉冮檺...');
          
          const writeGranted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
            {
              title: '鍐欏叆鏉冮檺',
              message: '搴旂敤闇€瑕佸啓鍏ユ潈闄愭潵鍒犻櫎鍥剧墖鏂囦欢銆傝鍦ㄦ潈闄愬脊绐椾腑閫夋嫨"鍏佽" ?,
              buttonNeutral: '绋嶅悗璇㈤棶',
              buttonNegative: '鍙栨秷',
              buttonPositive: '纭畾',
            }
          );
          
          console.log(`馃搵 鍐欏叆鏉冮檺璇锋眰缁撴灉: ${writeGranted}`);
          
          if (writeGranted === PermissionsAndroid.RESULTS.GRANTED) {
            console.log(' ?鍐欏叆鏉冮檺宸叉巿 ?);
          } else {
            console.log('鈿狅笍 鍐欏叆鏉冮檺鏈巿浜堬紝鍒犻櫎鍔熻兘鍙兘鍙楅檺');
          }
        }
        
        // 鎻愮ず鐢ㄦ埛鎵嬪姩鎺堟潈楂樼骇鏉冮檺
        console.log('馃搵 楂樼骇鏉冮檺璇存槑:');
        console.log('   鏌愪簺鏉冮檺闇€瑕佸湪绯荤粺璁剧疆涓墜鍔ㄦ巿 ?');
        console.log('   1. 璁剧疆 -> 搴旂敤 -> 鍥剧墖鍒嗙被搴旂敤 -> 鏉冮檺');
        console.log('   2. 鍏佽"瀛樺偍" ?绠＄悊鎵€鏈夋枃 ?绛夋潈 ?);
        console.log('   3. 鎴栬€呬娇鐢ㄦ枃浠剁鐞嗗櫒鎵嬪姩鍒犻櫎鍥剧墖');
        
      } catch (error) {
        console.error(' ?璇锋眰鏉冮檺澶辫触:', error);
        console.log('馃搵 璇锋寜浠ヤ笅姝ラ鎵嬪姩鎺堜簣鏉冮檺 ?);
        if (Platform.Version >= 33) {
          console.log('1. 闀挎寜搴旂敤鍥炬爣');
          console.log('2. 閫夋嫨"搴旂敤淇℃伅"');
          console.log('3. 鐐瑰嚮"鏉冮檺"');
          console.log('4. 鍏佽"鐩稿唽"鏉冮檺');
        } else {
          console.log('1. 闀挎寜搴旂敤鍥炬爣');
          console.log('2. 閫夋嫨"搴旂敤淇℃伅"');
          console.log('3. 鐐瑰嚮"鏉冮檺"');
          console.log('4. 鍏佽"瀛樺偍"鏉冮檺');
        }
        throw error;
      }
    }
  }

  // 鑷姩鎵弿鏈湴鐩稿唽涓殑鎵€鏈夊浘 ?
  async scanGallery() {
    try {
      await this.ensureInitialized();
      
      console.log('寮€濮嬭嚜鍔ㄦ壂鎻忔湰鍦扮浉 ?..');
      
      let allImages = [];
      
      // 閬嶅巻姣忎釜鐩稿唽璺緞
      for (const path of this.galleryPaths) {
        try {
          console.log(`灏濊瘯鎵弿璺緞: ${path}`);
          const images = await this.scanDirectory(path);
          if (images.length > 0) {
            console.log(`璺緞 ${path} 鎵惧埌 ${images.length} 寮犲浘鐗嘸);
            allImages = [...allImages, ...images];
          } else {
            console.log(`璺緞 ${path} 娌℃湁鎵惧埌鍥剧墖`);
          }
        } catch (error) {
          console.log(`璺緞 ${path} 鎵弿澶辫触:`, error.message);
          // 缁х画鎵弿鍏朵粬璺緞
        }
      }
      
      // 濡傛灉娌℃湁鎵惧埌鍥剧墖锛屽皾璇曚娇 ?react-native-fs 鐨勫父閲忚矾 ?
      if (allImages.length === 0) {
        console.log('灏濊瘯浣跨敤 RNFS 甯搁噺璺緞...');
        try {
          const externalDir = RNFS.ExternalDirectoryPath;
          const picturesDir = RNFS.PicturesDirectoryPath;
          const dcimDir = RNFS.DCIMDirectoryPath;
          
          console.log(`ExternalDirectoryPath: ${externalDir}`);
          console.log(`PicturesDirectoryPath: ${picturesDir}`);
          console.log(`DCIMDirectoryPath: ${dcimDir}`);
          
          // 灏濊瘯杩欎簺璺緞
          const additionalPaths = [externalDir, picturesDir, dcimDir].filter(Boolean);
          for (const path of additionalPaths) {
            try {
              console.log(`灏濊瘯 RNFS 璺緞: ${path}`);
              const images = await this.scanDirectory(path);
              if (images.length > 0) {
                console.log(`RNFS 璺緞 ${path} 鎵惧埌 ${images.length} 寮犲浘鐗嘸);
                allImages = [...allImages, ...images];
              }
            } catch (error) {
              console.log(`RNFS 璺緞 ${path} 鎵弿澶辫触:`, error.message);
            }
          }
        } catch (error) {
          console.log('RNFS 甯搁噺璺緞鑾峰彇澶辫触:', error.message);
        }
      }
      
             // 鎸夋媿鎽勬椂闂存帓搴忥紝鏈€鏂扮殑鍦ㄥ墠 ?
       // 濡傛灉娌℃湁鎷嶆憚鏃堕棿锛屽垯鎸夋枃浠舵椂闂存帓 ?
       allImages.sort((a, b) => {
         const timeA = a.takenAt || a.timestamp;
         const timeB = b.takenAt || b.timestamp;
         return timeB - timeA;
       });
      
      console.log(`鑷姩鎵弿瀹屾垚锛屾€诲叡鍙戠幇 ${allImages.length} 寮犲浘鐗嘸);
      
      if (allImages.length === 0) {
        console.log('鈿狅笍 娌℃湁鎵惧埌浠讳綍鍥剧墖锛屽彲鑳界殑鍘熷洜 ?);
        console.log('1. 妯℃嫙鍣ㄤ腑娌℃湁鍥剧墖鏂囦欢');
        console.log('2. 鏂囦欢璺緞涓嶆 ?);
        console.log('3. 鏉冮檺闂');
        console.log('4. 鏂囦欢绯荤粺缁撴瀯涓嶅悓');
      }
      
      return allImages;
      
    } catch (error) {
      console.error('鑷姩鎵弿鐩稿唽澶辫触:', error);
      throw error;
    }
  }

  // 鑷姩鎵弿鐩稿唽锛堝吋瀹规柟娉曪級
  async autoScanGallery() {
    return await this.autoScanGalleryWithProgress();
  }

  // 鑷姩鎵弿鐩稿唽锛堝甫杩涘害鍥炶皟 ?
  async autoScanGalleryWithProgress(onProgress) {
    try {
      console.log('寮€濮嬭嚜鍔ㄦ壂鎻忔湰鍦扮浉 ?..');
      
      // 鑾峰彇宸插瓨鍦ㄧ殑鍥剧墖璁板綍锛岀敤浜庡閲忔壂 ?
      const existingImages = await ImageStorageService.getImages();
      const existingUris = new Set(existingImages.map(img => img.uri));
      
      console.log(`宸插瓨 ?${existingImages.length} 寮犲浘鐗囪褰曪紝寮€濮嬪閲忔壂 ?..`);
      
      // 閫氱煡杩涘害锛氬垵濮嬪寲瀹屾垚
      if (onProgress) {
        onProgress({
          current: 0,
          total: 0,
          message: '姝ｅ湪鎵弿鏈湴鐩稿唽鐩綍...',
          filesFound: 0,
          filesProcessed: 0,
          filesFailed: 0
        });
      }
      
      const allImages = [];
      let totalDirectories = 0;
      let currentDirectory = 0;
      
      // 棣栧厛璁＄畻鎬荤洰褰曟暟
      for (const path of this.galleryPaths) {
        try {
          const exists = await RNFS.exists(path);
          if (exists) {
            totalDirectories++;
          }
        } catch (error) {
          console.error(`妫€鏌ヨ矾 ?${path} 澶辫触:`, error);
        }
      }
      
      // 閫氱煡杩涘害锛氬紑濮嬫壂 ?
      if (onProgress) {
        onProgress({
          current: 0,
          total: totalDirectories,
          message: '姝ｅ湪鎵弿鐩綍...',
          filesFound: 0,
          filesProcessed: 0,
          filesFailed: 0
        });
      }
      
      for (const path of this.galleryPaths) {
        try {
          const exists = await RNFS.exists(path);
          if (!exists) continue;
          
          currentDirectory++;
          
          // 閫氱煡杩涘害锛氱洰褰曟壂鎻忚繘 ?
          if (onProgress) {
            onProgress({
              current: currentDirectory,
              total: totalDirectories,
              message: `姝ｅ湪鎵弿: ${path.split('/').pop()}`,
              filesFound: allImages.length,
              filesProcessed: 0,
              filesFailed: 0
            });
          }
          
          const images = await this.scanDirectory(path, existingUris);
          allImages.push(...images);
          
          // 閫氱煡杩涘害锛氭枃浠跺彂鐜拌繘 ?
          if (onProgress) {
            onProgress({
              current: currentDirectory,
              total: totalDirectories,
              message: `鍙戠幇 ${images.length} 寮犳柊鍥剧墖`,
              filesFound: allImages.length,
              filesProcessed: 0,
              filesFailed: 0
            });
          }
          
        } catch (error) {
          console.error(`鎵弿璺緞 ${path} 澶辫触:`, error);
        }
      }
      
      console.log(`澧為噺鎵弿瀹屾垚锛屽彂 ?${allImages.length} 寮犳柊鍥剧墖`);
      
      // 閫氱煡杩涘害锛氬紑濮嬪垎 ?
      if (onProgress) {
        onProgress({
          current: 0,
          total: allImages.length,
          message: '姝ｅ湪鍒嗙被鏂板彂鐜扮殑鍥剧墖...',
          filesFound: allImages.length,
          filesProcessed: 0,
          filesFailed: 0
        });
      }
      
      // 鍙鐞嗘柊鍙戠幇鐨勫浘 ?
      if (allImages.length > 0) {
        console.log('寮€濮嬪垎绫绘柊鍙戠幇鐨勫浘 ?..');
        let processedCount = 0;
        let failedCount = 0;
        
        for (const image of allImages) {
          try {
            const classification = await this.imageClassifier.classifyImage(image.uri, {
              timestamp: image.timestamp,
              fileSize: image.size,
              fileName: image.fileName
            });
            
            await ImageStorageService.saveImageClassification({
              uri: image.uri,
              category: classification.category,
              confidence: classification.confidence,
              timestamp: image.timestamp,
              takenAt: image.takenAt, // 娣诲姞鎷嶆憚鏃堕棿
              fileName: image.fileName,
              size: image.size,
              // 娣诲姞浣嶇疆淇℃伅
              latitude: image.latitude,
              longitude: image.longitude,
              altitude: image.altitude,
              accuracy: image.accuracy,
              address: image.address,
              city: image.city,
              country: image.country,
              province: image.province,
              district: image.district,
              street: image.street,
              locationSource: image.source
            });
            
            processedCount++;
            console.log(`鍥剧墖 ${image.fileName} 鍒嗙被瀹屾垚: ${classification.category}`);
            
            // 閫氱煡杩涘害锛氬垎绫昏繘 ?
            if (onProgress) {
              onProgress({
                current: processedCount,
                total: allImages.length,
                message: `姝ｅ湪鍒嗙被: ${image.fileName}`,
                filesFound: allImages.length,
                filesProcessed: processedCount,
                filesFailed: failedCount
              });
            }
            
          } catch (error) {
            failedCount++;
            console.error(`鍒嗙被鍥剧墖 ${image.fileName} 澶辫触:`, error);
            
            // 閫氱煡杩涘害锛氬け璐ョ粺 ?
            if (onProgress) {
              onProgress({
                current: processedCount,
                total: allImages.length,
                message: `鍒嗙被澶辫触: ${image.fileName}`,
                filesFound: allImages.length,
                filesProcessed: processedCount,
                filesFailed: failedCount
              });
            }
          }
        }
        
        // 閫氱煡杩涘害锛氬畬 ?
        if (onProgress) {
          onProgress({
            current: allImages.length,
            total: allImages.length,
            message: '鎵弿鍜屽垎绫诲畬鎴愶紒',
            filesFound: allImages.length,
            filesProcessed: processedCount,
            filesFailed: failedCount
          });
        }
      }
      
      return allImages;
    } catch (error) {
      console.error('鑷姩鎵弿鏈湴鐩稿唽澶辫触:', error);
      throw error;
    }
  }

  // 鎵嬪姩閲嶆柊鎵弿鐩稿唽锛堝畬鏁存壂鎻忥級
  async manualRescanGallery() {
    try {
      console.log('寮€濮嬫墜鍔ㄩ噸鏂版壂鎻忔湰鍦扮浉 ?..');
      console.log('galleryPaths:', this.galleryPaths);
      
      // 娓呯┖鐜版湁璁板綍锛岃繘琛屽畬鏁存壂 ?
      const allImages = [];
      
      for (const path of this.galleryPaths) {
        try {
          console.log(`姝ｅ湪鎵弿璺緞: ${path}`);
          const images = await this.scanDirectory(path, new Set()); // 浼犲叆绌篠et锛屾壂鎻忔墍鏈夋枃 ?
          console.log(`璺緞 ${path} 鎵弿瀹屾垚锛屾壘 ?${images.length} 寮犲浘鐗嘸);
          allImages.push(...images);
        } catch (error) {
          console.error(`鎵弿璺緞 ${path} 澶辫触:`, error);
        }
      }
      
      console.log(`鎵嬪姩閲嶆柊鎵弿瀹屾垚锛屽彂 ?${allImages.length} 寮犲浘鐗嘸);
      
             // 澶勭悊鎵€鏈夊彂鐜扮殑鍥剧墖
       if (allImages.length > 0) {
         console.log('寮€濮嬪垎绫绘墍鏈夊浘 ?..');
         
         
         
         for (const image of allImages) {
            try {
              console.log(`姝ｅ湪鍒嗙被鍥剧墖: ${image.fileName}`);
              const classification = await this.imageClassifier.classifyImage(image.uri, {
                timestamp: image.timestamp,
                fileSize: image.size,
                fileName: image.fileName
              });
            
            await ImageStorageService.saveImageClassification({
              uri: image.uri,
              category: classification.category,
              confidence: classification.confidence,
              timestamp: image.timestamp,
              takenAt: image.takenAt, // 娣诲姞鎷嶆憚鏃堕棿
              fileName: image.fileName,
              size: image.size,
              // 娣诲姞浣嶇疆淇℃伅
              latitude: image.latitude,
              longitude: image.longitude,
              altitude: image.altitude,
              accuracy: image.accuracy,
              address: image.address,
              city: image.city,
              country: image.country,
              province: image.province,
              district: image.district,
              street: image.street,
              locationSource: image.source
            });
            
            console.log(`鍥剧墖 ${image.fileName} 鍒嗙被瀹屾垚: ${classification.category}`);
          } catch (error) {
            console.error(`鍒嗙被鍥剧墖 ${image.fileName} 澶辫触:`, error);
          }
        }
      }
      
      return allImages;
    } catch (error) {
      console.error('鎵嬪姩閲嶆柊鎵弿鏈湴鐩稿唽澶辫触:', error);
      console.error('閿欒鍫嗘爤:', error.stack);
      throw error;
    }
  }

  // 鎵弿鎸囧畾鐩綍
  async scanDirectory(dirPath, existingUris = new Set()) {
    try {
      console.log(`寮€濮嬫壂鎻忕洰 ? ${dirPath}`);
      
      if (!existingUris || !(existingUris instanceof Set)) {
        console.warn('existingUris 涓嶆槸鏈夋晥 ?Set锛屽垱寤烘柊鐨勭┖ Set');
        existingUris = new Set();
      }
      
      const exists = await RNFS.exists(dirPath);
      if (!exists) {
        console.log(`鐩綍涓嶅瓨 ? ${dirPath}`);
        return [];
      }
      
      console.log(`鐩綍瀛樺湪锛屽紑濮嬭鍙栧唴 ?..`);
      const items = await RNFS.readDir(dirPath);
      console.log(`鐩綍 ${dirPath} 鍖呭惈 ${items.length} 涓」鐩甡);
      
      const images = [];
      
      for (const item of items) {
        if (item.isDirectory()) {
          console.log(`鍙戠幇瀛愮洰 ? ${item.name}`);
          const subImages = await this.scanDirectory(item.path, existingUris);
          images.push(...subImages);
        } else if (this.isImageFile(item.name)) {
          // 妫€鏌ユ枃浠舵槸鍚﹀凡缁忓瓨 ?
          const fileUri = `file://${item.path}`;
          if (existingUris.has(fileUri)) {
            continue;
          }
          
                     console.log(`鍙戠幇鏂板浘鐗囨枃 ? ${item.name}`);
           
                      try {
                const stats = await RNFS.stat(item.path);
                const takenTime = await extractTakenTime(item.path);
                const locationInfo = await extractLocationInfo(item.path);
                
                // 鑾峰彇鏂囦欢鐨勫绉嶆椂闂翠俊 ?
                const mtime = stats.mtime ? new Date(stats.mtime).getTime() : null;
                const ctime = stats.ctime ? new Date(stats.ctime).getTime() : null;
                const currentTime = Date.now();
                
                // 瀵逛簬浠庣數鑴戞嫹璐濆埌妯℃嫙鍣ㄧ殑鏂囦欢 ?
                // - ctime锛堝垱寤烘椂闂达級閫氬父閲嶇疆涓烘嫹璐濇椂闂达紝鏇村噯纭弽鏄犳枃浠跺湪妯℃嫙鍣ㄤ腑鐨勭姸 ?
                // - mtime锛堜慨鏀规椂闂达級鍙兘淇濈暀鍘熷鏃堕棿锛屼笉澶熷噯 ?
                // - 鎴戜滑浼樺厛浣跨敤 ctime锛屽洜涓哄畠鏇村噯纭湴鍙嶆槧鏂囦欢琚嫹璐濆埌妯℃嫙鍣ㄧ殑鏃堕棿
                const fileTime = ctime || mtime || currentTime;
                
                const imageData = {
                   uri: fileUri,
                   fileName: item.name,
                   size: stats.size,
                   timestamp: fileTime, // 鏂囦欢鏃堕棿锛堟嫹 ?淇敼鏃堕棿 ?
                   takenAt: takenTime, // 鍙娇鐢ㄧ湡姝ｇ殑EXIF鎷嶆憚鏃堕棿
                   path: item.path,
                   // 娣诲姞浣嶇疆淇℃伅
                   ...locationInfo // 灞曞紑浣嶇疆淇℃伅鍒伴《灞傦紝鏂逛究鍚庣画澶勭悊
                 };
               
               images.push(imageData);
             } catch (error) {
               console.error(`鑾峰彇鏂囦欢 ${item.name} 淇℃伅澶辫触:`, error);
             }
        }
      }
      
      console.log(`鐩綍 ${dirPath} 鎵弿瀹屾垚锛屾壘 ?${images.length} 寮犲浘鐗嘸);
      return images;
    } catch (error) {
      console.error(`鎵弿鐩綍 ${dirPath} 澶辫触:`, error);
      console.error('閿欒鍫嗘爤:', error.stack);
      return [];
    }
  }

  // 鍒ゆ柇鏄惁涓哄浘鐗囨枃 ?
  isImageFile(fileName) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const lowerFileName = fileName.toLowerCase();
    return imageExtensions.some(ext => lowerFileName.endsWith(ext));
  }

  // 娴嬭瘯鏂囦欢绯荤粺璁块棶
  async testFileSystemAccess() {
    try {
      console.log('=== 寮€濮嬫祴璇曟枃浠剁郴缁熻 ?===');
      
      // 娴嬭瘯 RNFS 甯搁噺
      console.log('RNFS 甯搁噺:');
      console.log(`ExternalDirectoryPath: ${RNFS.ExternalDirectoryPath}`);
      console.log(`PicturesDirectoryPath: ${RNFS.PicturesDirectoryPath}`);
      console.log(`DCIMDirectoryPath: ${RNFS.DCIMDirectoryPath}`);
      console.log(`DocumentDirectoryPath: ${RNFS.DocumentDirectoryPath}`);
      console.log(`MainBundlePath: ${RNFS.MainBundlePath}`);
      
      // 娴嬭瘯鍩烘湰璺緞
      const testPaths = [
        '/storage/emulated/0',
        '/sdcard',
        '/mnt/sdcard',
        RNFS.ExternalDirectoryPath,
        RNFS.PicturesDirectoryPath,
        RNFS.DCIMDirectoryPath,
        
        // 鐢ㄦ埛妯℃嫙鍣ㄤ腑鐨勫疄闄呰矾 ?
        '/storage/emulated/0/Pictures',
        '/storage/emulated/0/Pictures/Pictures',
        '/sdcard/Pictures',
        '/sdcard/Pictures/Pictures',
      ];
      
      for (const path of testPaths) {
        if (path) {
          try {
            const exists = await RNFS.exists(path);
            console.log(`璺緞 ${path} 瀛樺湪: ${exists}`);
            
            if (exists) {
              try {
                const items = await RNFS.readDir(path);
                console.log(`璺緞 ${path} 鍖呭惈 ${items.length} 涓」鐩甡);
                
                // 鏄剧ず鍓嶅嚑涓」 ?
                const firstItems = items.slice(0, 5);
                firstItems.forEach(item => {
                  console.log(`  - ${item.name} (${item.isDirectory() ? '鐩綍' : '鏂囦欢'})`);
                });
                
                if (items.length > 5) {
                  console.log(`  ... 杩樻湁 ${items.length - 5} 涓」鐩甡);
                }
              } catch (error) {
                console.log(`璇诲彇璺緞 ${path} 澶辫触:`, error.message);
              }
            }
          } catch (error) {
            console.log(`妫€鏌ヨ矾 ?${path} 澶辫触:`, error.message);
          }
        }
      }
      
      console.log('=== 鏂囦欢绯荤粺璁块棶娴嬭瘯瀹屾垚 ===');
    } catch (error) {
      console.error('鏂囦欢绯荤粺璁块棶娴嬭瘯澶辫触:', error);
    }
  }

  // 娴嬭瘯宸茬煡鏂囦欢鏄惁瀛樺湪
  async testKnownFile() {
    try {
      console.log('=== 寮€濮嬫祴璇曞凡鐭ユ枃 ?===');
      
      // 鏍规嵁鐢ㄦ埛鎴浘涓殑淇℃伅娴嬭瘯
      const knownFile = '/storage/emulated/0/Pictures/Pictures/test2.jpg';
      
      console.log(`娴嬭瘯鏂囦欢: ${knownFile}`);
      
      // 妫€鏌ユ枃浠舵槸鍚﹀瓨 ?
      const exists = await RNFS.exists(knownFile);
      console.log(`鏂囦欢瀛樺湪: ${exists}`);
      
      if (exists) {
        try {
          // 鑾峰彇鏂囦欢淇℃伅
          const stats = await RNFS.stat(knownFile);
          console.log(`鏂囦欢淇℃伅:`);
          console.log(`  澶у皬: ${stats.size} bytes`);
          console.log(`  淇敼鏃堕棿: ${stats.mtime}`);
          console.log(`  鍒涘缓鏃堕棿: ${stats.ctime}`);
          console.log(`  鏉冮檺: ${stats.mode}`);
          
          // 灏濊瘯璇诲彇鏂囦欢澶达紙 ?00瀛楄妭 ?
          const fileContent = await RNFS.read(knownFile, 100, 0, 'ascii');
          console.log(`鏂囦欢澶村唴 ? ${fileContent}`);
          
        } catch (error) {
          console.log(`璇诲彇鏂囦欢淇℃伅澶辫触:`, error.message);
        }
      }
      
      // 灏濊瘯鍏朵粬鍙兘鐨勮矾 ?
      const alternativePaths = [
        '/sdcard/Pictures/Pictures/test2.jpg',
        '/mnt/sdcard/Pictures/Pictures/test2.jpg',
        '/storage/emulated/0/Pictures/test2.jpg',
        '/sdcard/Pictures/test2.jpg',
      ];
      
      for (const path of alternativePaths) {
        try {
          const altExists = await RNFS.exists(path);
          console.log(`鏇夸唬璺緞 ${path} 瀛樺湪: ${altExists}`);
        } catch (error) {
          console.log(`妫€鏌ユ浛浠ｈ矾 ?${path} 澶辫触:`, error.message);
        }
      }
      
      console.log('=== 宸茬煡鏂囦欢娴嬭瘯瀹屾垚 ===');
    } catch (error) {
      console.error('宸茬煡鏂囦欢娴嬭瘯澶辫触:', error);
    }
  }

  // 妫€鏌ユ潈闄愮姸 ?
  async checkPermissions() {
    try {
      console.log('=== 寮€濮嬫鏌ユ潈闄愮姸 ?===');
      
      if (Platform.OS === 'android') {
        // 妫€鏌ュ瓨鍌ㄦ潈 ?
        const storagePermission = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
        );
        console.log(`瀛樺偍鏉冮檺鐘?? ${storagePermission ? '宸叉巿 ? : '鏈巿 ?}`);
        
        // 妫€鏌ュ獟浣撴潈闄愶紙Android 13+ ?
        let mediaPermission = false;
        if (Platform.Version >= 33) {
          try {
            mediaPermission = await PermissionsAndroid.check(
              PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
            );
            console.log(`濯掍綋鏉冮檺鐘?? ${mediaPermission ? '宸叉巿 ? : '鏈巿 ?}`);
          } catch (error) {
            console.log(`妫€鏌ュ獟浣撴潈闄愬け ? ${error.message}`);
          }
        }
        
        // 妫€ ?Android 鐗堟湰
        console.log(`Android API 绾у埆: ${Platform.Version}`);
        
        // 濡傛灉鏉冮檺鏈巿浜堬紝鎻愪緵璇︾粏鐨勮缃寚 ?
        if (!storagePermission && !mediaPermission) {
          console.log('=== 鏉冮檺璁剧疆鎸囧 ===');
          console.log('璇锋寜浠ヤ笅姝ラ鎵嬪姩鎺堜簣鏉冮檺 ?);
          console.log('');
          console.log('姝ラ1 - 鍦ㄥ綋鍓嶆潈闄愰〉闈㈡煡鎵撅細');
          console.log('1. 鍚戜笅婊氬姩锛屾煡鐪嬫槸鍚︽湁"鏈厑 ?鏉冮檺绫诲埆');
          console.log('2. 鐐瑰嚮鍙充笂瑙掍笁涓偣鑿滃崟(:)锛屾煡 ?鎵€鏈夋潈 ?閫夐」');
          console.log('3. 鐐瑰嚮"Camera"鏉冮檺锛屾煡鐪嬫槸鍚︽湁"鐩稿叧鏉冮檺"');
          console.log('');
          console.log('姝ラ2 - 濡傛灉鎵句笉鍒帮紝閫氳繃璁剧疆搴旂敤 ?);
          console.log('1. 鍥炲埌涓诲睆骞曪紙鎸塇ome閿級');
          console.log('2. 鎵撳紑璁剧疆搴旂敤锛堥娇杞浘鏍囷級');
          console.log('3. 鎵惧埌"搴旂敤" ?Apps"');
          console.log('4. 鎵惧埌"ImageClassifier"搴旂敤');
          console.log('5. 鐐瑰嚮"鏉冮檺" ?Permissions"');
          console.log('6. 鏌ョ湅瀹屾暣鏉冮檺鍒楄〃');
          console.log('');
          console.log('姝ラ3 - 鏌ユ壘浠ヤ笅鏉冮檺锛堝彲鑳藉彨涓嶅悓鍚嶇О锛夛細');
          console.log('- "鐩稿唽"  ?"Photos"');
          console.log('- "濯掍綋"  ?"Media"');
          console.log('- "鏂囦欢"  ?"Files"');
          console.log('- "瀛樺偍"  ?"Storage"');
          console.log('- "鍥剧墖"  ?"Images"');
          console.log('');
          console.log('姝ラ4 - 鎺堜簣鏉冮檺 ?);
          console.log('鎵惧埌鐩稿叧鏉冮檺鍚庯紝灏嗗叾璁剧疆 ?鍏佽" ?Allow"');
          console.log('');
          console.log('濡傛灉杩樻槸鎵句笉鍒帮紝璇峰皾璇曪細');
          console.log('1. 閲嶅惎妯℃嫙 ?);
          console.log('2. 妫€鏌ユā鎷熷櫒璁剧疆涓殑鏉冮檺閰嶇疆');
          console.log('3. 鏌ョ湅鏄惁 ?楂樼骇鏉冮檺"閫夐」');
          console.log('');
          console.log('鏉冮檺鎺堜簣鍚庯紝璇烽噸鏂拌繍琛屽簲鐢紒');
        } else if (storagePermission || mediaPermission) {
          console.log(' ?鏉冮檺宸叉巿浜堬紝鍙互姝ｅ父鎵弿鐩稿唽 ?);
        }
      }
      
      console.log('=== 鏉冮檺妫€鏌ュ畬 ?===');
    } catch (error) {
      console.error('鏉冮檺妫€鏌ュけ ?', error);
    }
  }

  // 纭繚鏈嶅姟宸插垵濮嬪寲
  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  // 鑾峰彇鐩稿唽缁熻淇℃伅
  async getGalleryStats() {
    try {
      const images = await this.scanGallery();
      
      const stats = {
        totalImages: images.length,
        byCategory: {},
        byDate: {},
        totalSize: 0,
        averageSize: 0,
      };
      
      // 鎸夊垎绫荤粺 ?
      images.forEach(img => {
        if (!stats.byCategory[img.category]) {
          stats.byCategory[img.category] = 0;
        }
        stats.byCategory[img.category]++;
        stats.totalSize += img.size || 0; // 淇锛氫娇 ?size 鑰屼笉 ?fileSize
      });
      
      // 鎸夋棩鏈熺粺 ?
      images.forEach(img => {
        const date = new Date(img.timestamp).toDateString();
        if (!stats.byDate[date]) {
          stats.byDate[date] = 0;
        }
        stats.byDate[date]++;
      });
      
      stats.averageSize = stats.totalImages > 0 ? stats.totalSize / stats.totalImages : 0;
      
      return stats;
    } catch (error) {
      console.error('鑾峰彇鐩稿唽缁熻澶辫触:', error);
      throw error;
    }
  }

  // 娴嬭瘯浣嶇疆淇℃伅鎻愬彇鍔熻兘
  async testLocationExtraction() {
    try {
      console.log('馃И 寮€濮嬫祴璇曚綅缃俊鎭彁鍙栧姛 ?..');
      
      // 鑾峰彇鎵€鏈夊浘 ?
      const allImages = await ImageStorageService.getImages();
      console.log(`馃搳 鏁版嵁搴撲腑鎬诲叡 ?${allImages.length} 寮犲浘鐗嘸);
      
      // 缁熻鏈変綅缃俊鎭殑鍥剧墖
      let imagesWithLocation = 0;
      let imagesWithGPS = 0;
      let imagesWithAddress = 0;
      const locationStats = {
        bySource: {},
        byCity: {},
        byCountry: {},
        gpsCoordinates: [],
        recentWithLocation: []
      };
      
      allImages.forEach((img, index) => {
        if (img.location) {
          imagesWithLocation++;
          
          // 缁熻GPS鍧愭爣
          if (img.location.latitude && img.location.longitude) {
            imagesWithGPS++;
            locationStats.gpsCoordinates.push({
              fileName: img.fileName,
              latitude: img.location.latitude,
              longitude: img.location.longitude,
              accuracy: img.location.accuracy
            });
          }
          
          // 缁熻鍦板潃淇℃伅
          if (img.location.address || img.location.city) {
            imagesWithAddress++;
          }
          
          // 鎸夋潵婧愮粺 ?
          const source = img.location.source || 'unknown';
          locationStats.bySource[source] = (locationStats.bySource[source] || 0) + 1;
          
          // 鎸夊煄甯傜粺 ?
          if (img.location.city) {
            locationStats.byCity[img.location.city] = (locationStats.byCity[img.location.city] || 0) + 1;
          }
          
          // 鎸夊浗瀹剁粺 ?
          if (img.location.country) {
            locationStats.byCountry[img.location.country] = (locationStats.byCountry[img.location.country] || 0) + 1;
          }
          
          // 鏀堕泦鏈€ ?寮犳湁浣嶇疆淇℃伅鐨勫浘 ?
          if (locationStats.recentWithLocation.length < 5) {
            locationStats.recentWithLocation.push({
              fileName: img.fileName,
              category: img.category,
              location: img.location,
              takenAt: img.takenAt ? new Date(img.takenAt).toLocaleString('zh-CN') : '鏈煡'
            });
          }
        }
      });
      
      // 杈撳嚭娴嬭瘯缁撴灉
      console.log('\n馃搵 浣嶇疆淇℃伅鎻愬彇娴嬭瘯缁撴灉:');
      console.log('================================');
      console.log(`馃搳 鎬诲浘鐗囨暟 ? ${allImages.length}`);
      console.log(`馃搷 鏈変綅缃俊鎭殑鍥剧墖: ${imagesWithLocation}`);
      console.log(`馃實 鏈塆PS鍧愭爣鐨勫浘 ? ${imagesWithGPS}`);
      console.log(`馃彔 鏈夊湴鍧€淇℃伅鐨勫浘 ? ${imagesWithAddress}`);
      console.log(`馃搱 浣嶇疆淇℃伅瑕嗙洊 ? ${((imagesWithLocation / allImages.length) * 100).toFixed(1)}%`);
      
      console.log('\n馃搳 鎸夋潵婧愮粺 ?');
      Object.entries(locationStats.bySource).forEach(([source, count]) => {
        console.log(`   ${source}: ${count} 寮燻);
      });
      
      if (Object.keys(locationStats.byCity).length > 0) {
        console.log('\n馃彊 ?鎸夊煄甯傜粺 ?');
        Object.entries(locationStats.byCity).forEach(([city, count]) => {
          console.log(`   ${city}: ${count} 寮燻);
        });
      }
      
      if (Object.keys(locationStats.byCountry).length > 0) {
        console.log('\n馃實 鎸夊浗瀹剁粺 ?');
        Object.entries(locationStats.byCountry).forEach(([country, count]) => {
          console.log(`   ${country}: ${count} 寮燻);
        });
      }
      
      if (locationStats.gpsCoordinates.length > 0) {
        console.log('\n馃椇 ?GPS鍧愭爣绀轰緥:');
        locationStats.gpsCoordinates.slice(0, 3).forEach(coord => {
          console.log(`   ${coord.fileName}: ${coord.latitude}, ${coord.longitude} (绮惧害: ${coord.accuracy || '鏈煡'})`);
        });
      }
      
      if (locationStats.recentWithLocation.length > 0) {
        console.log('\n馃摳 鏈€杩戞湁浣嶇疆淇℃伅鐨勫浘 ?');
        locationStats.recentWithLocation.forEach(img => {
          console.log(`   ${img.fileName} (${img.category}) - ${img.takenAt}`);
          if (img.location.latitude && img.location.longitude) {
            console.log(`     GPS: ${img.location.latitude}, ${img.location.longitude}`);
          }
          if (img.location.city) {
            console.log(`     鍩庡競: ${img.location.city}`);
          }
        });
      }
      
      console.log('\n ?浣嶇疆淇℃伅鎻愬彇娴嬭瘯瀹屾垚!');
      
      return {
        totalImages: allImages.length,
        imagesWithLocation,
        imagesWithGPS,
        imagesWithAddress,
        coverageRate: (imagesWithLocation / allImages.length) * 100,
        locationStats
      };
      
    } catch (error) {
      console.error(' ?浣嶇疆淇℃伅鎻愬彇娴嬭瘯澶辫触:', error);
      throw error;
    }
  }

  // 娴嬭瘯鍗曞紶鍥剧墖鐨勪綅缃俊鎭彁 ?
  async testSingleImageLocation(imagePath) {
    try {
      console.log(`馃И 娴嬭瘯鍗曞紶鍥剧墖浣嶇疆淇℃伅鎻愬彇: ${imagePath}`);
      
      const locationInfo = await extractLocationInfo(imagePath);
      
      if (locationInfo) {
        console.log(' ?浣嶇疆淇℃伅鎻愬彇鎴愬姛:');
        console.log(JSON.stringify(locationInfo, null, 2));
        return locationInfo;
      } else {
        console.log('鈿狅笍 鏈壘鍒颁綅缃俊 ?);
        return null;
      }
    } catch (error) {
      console.error(' ?鍗曞紶鍥剧墖浣嶇疆淇℃伅鎻愬彇澶辫触:', error);
      throw error;
    }
  }
}

export default GalleryScannerService;
