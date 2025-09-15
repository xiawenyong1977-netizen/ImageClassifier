import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator, ScrollView, FlatList } from 'react-native';
import { SafeAreaView } from '../../adapters/WebAdapters';
import { launchImageLibrary } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';
import ImageClassifierService from '../../services/ImageClassifierService';
import GalleryScannerService from '../../services/GalleryScannerService';

const ImageUploadScreen = ({ navigation }) => {
  const [allImages, setAllImages] = useState([]);
  const [selectedImages, setSelectedImages] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Auto scan gallery when component mounts
  useEffect(() => {
    scanGallery();
  }, []);

  // Scan gallery
  const scanGallery = async () => {
    setScanning(true);
    try {
      // Use gallery scanner service through unified data service
      const galleryScannerService = new GalleryScannerService();
      await galleryScannerService.initialize();
      
      // 使用新的扫描方法
      const result = await galleryScannerService.scanGalleryWithProgress((progress) => {
        console.log('扫描进度:', progress);
      });
      
      // 获取所有图片数据
      const allImages = await UnifiedDataService.readAllImages();
      setAllImages(allImages);
      
      // Auto select all images
      setSelectedImages(allImages);
      
    } catch (error) {
      console.error('Failed to scan gallery:', error);
      Alert.alert('Error', 'Failed to scan gallery: ' + error.message);
    } finally {
      setScanning(false);
    }
  };

  // Process image classification
  const handleProcessImages = async () => {
    if (selectedImages.length === 0) {
      Alert.alert('Notice', 'No images to process');
      return;
    }

    setProcessing(true);
    try {
      const imageClassifierService = new ImageClassifierService();
      
      let processedCount = 0;
      let successCount = 0;
      let failedCount = 0;

      for (const image of selectedImages) {
        try {
          // Classify image
          const classification = await imageClassifierService.classifyImage(image.uri);
          
          if (classification && classification.category) {
            // Save classified image
            const classifiedImage = {
              ...image,
              category: classification.category,
              confidence: classification.confidence,
              classifiedAt: new Date().toISOString()
            };
            
            await UnifiedDataService.writeImageClassification(classifiedImage);
            successCount++;
          } else {
            // Save as unclassified
            const unclassifiedImage = {
              ...image,
              category: 'other',
              confidence: 0,
              classifiedAt: new Date().toISOString()
            };
            
            await UnifiedDataService.writeImageClassification(unclassifiedImage);
            successCount++;
          }
          
          processedCount++;
          
          // Update progress
          console.log(`Processed ${processedCount}/${selectedImages.length} images`);
          
        } catch (error) {
          console.error('Failed to process image:', image.fileName, error);
          failedCount++;
        }
      }

      Alert.alert(
        'Processing Complete',
        `Successfully processed ${successCount} images\nFailed: ${failedCount} images`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );

    } catch (error) {
      console.error('Processing failed:', error);
      Alert.alert('Error', 'Processing failed: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  // Select image from library
  const handleSelectFromLibrary = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        multiple: true,
        selectionLimit: 0
      });

      if (result && result.assets) {
        const newImages = result.assets.map(asset => ({
          id: Date.now() + Math.random(),
          uri: asset.uri,
          fileName: asset.fileName || `image_${Date.now()}.jpg`,
          size: asset.fileSize || 0,
          width: asset.width || 0,
          height: asset.height || 0,
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString()
        }));

        setAllImages(prev => [...prev, ...newImages]);
        setSelectedImages(prev => [...prev, ...newImages]);
      }
    } catch (error) {
      console.error('Failed to select images:', error);
      Alert.alert('Error', 'Failed to select images: ' + error.message);
    }
  };

  // Toggle image selection
  const toggleImageSelection = (imageId) => {
    setSelectedImages(prev => {
      if (prev.some(img => img.id === imageId)) {
        return prev.filter(img => img.id !== imageId);
      } else {
        const image = allImages.find(img => img.id === imageId);
        return image ? [...prev, image] : prev;
      }
    });
  };

  // Select all images
  const selectAllImages = () => {
    setSelectedImages([...allImages]);
  };

  // Deselect all images
  const deselectAllImages = () => {
    setSelectedImages([]);
  };

  // Render image item
  const renderImageItem = ({ item }) => {
    const isSelected = selectedImages.some(img => img.id === item.id);
    
    return (
      <TouchableOpacity
        style={[styles.imageItem, isSelected && styles.selectedImageItem]}
        onPress={() => toggleImageSelection(item.id)}>
        <Image
          source={{ uri: item.uri }}
          style={styles.image}
          resizeMode="cover"
        />
        {isSelected && (
          <View style={styles.selectionIndicator}>
            <Text style={styles.selectionText}>✓</Text>
          </View>
        )}
        <Text style={styles.imageName} numberOfLines={1}>
          {item.fileName || 'Unknown'}
        </Text>
      </TouchableOpacity>
    );
  };

  // Render header
  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}>
        <Text style={styles.backIcon}>←</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Upload Images</Text>
      <View style={styles.placeholder} />
    </View>
  );

  // Render actions
  const renderActions = () => (
    <View style={styles.actionsContainer}>
      <TouchableOpacity
        style={styles.actionButton}
        onPress={handleSelectFromLibrary}>
        <Text style={styles.actionButtonText}>📁 Select from Library</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.actionButton}
        onPress={scanGallery}>
        <Text style={styles.actionButtonText}>🔄 Rescan Gallery</Text>
      </TouchableOpacity>
    </View>
  );

  // Render selection controls
  const renderSelectionControls = () => (
    <View style={styles.selectionControls}>
      <TouchableOpacity
        style={styles.controlButton}
        onPress={selectAllImages}>
        <Text style={styles.controlButtonText}>Select All</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.controlButton}
        onPress={deselectAllImages}>
        <Text style={styles.controlButtonText}>Deselect All</Text>
      </TouchableOpacity>
      
      <Text style={styles.selectionCount}>
        {selectedImages.length} / {allImages.length} selected
      </Text>
    </View>
  );

  // Render process button
  const renderProcessButton = () => (
    <TouchableOpacity
      style={[styles.processButton, selectedImages.length === 0 && styles.disabledButton]}
      onPress={handleProcessImages}
      disabled={selectedImages.length === 0 || processing}>
      {processing ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={styles.processButtonText}>
          Process {selectedImages.length} Images
        </Text>
      )}
    </TouchableOpacity>
  );

  if (scanning) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Scanning gallery...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      {renderActions()}
      {renderSelectionControls()}
      
      <FlatList
        data={allImages}
        renderItem={renderImageItem}
        keyExtractor={(item, index) => item.id ? item.id.toString() : `image-${index}`}
        numColumns={3}
        contentContainerStyle={styles.imageGrid}
        showsVerticalScrollIndicator={false}
      />
      
      {renderProcessButton()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  backIcon: {
    fontSize: 24,
    color: '#333',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  actionsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  selectionControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  controlButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  controlButtonText: {
    fontSize: 14,
    color: '#333',
  },
  selectionCount: {
    fontSize: 14,
    color: '#666',
  },
  imageGrid: {
    padding: 8,
  },
  imageItem: {
    width: '33.33%',
    aspectRatio: 1,
    padding: 4,
    position: 'relative',
  },
  selectedImageItem: {
    opacity: 0.7,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  selectionIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  imageName: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  processButton: {
    margin: 16,
    padding: 16,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  processButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
});

export default ImageUploadScreen;