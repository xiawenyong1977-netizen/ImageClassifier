module.exports = {
  project: {
    android: {
      packageName: 'com.imageclassifier.v2'
    }
  },
  dependencies: {
    'react-native-sqlite-storage': {
      platforms: {
        android: {
          sourceDir: '../node_modules/react-native-sqlite-storage/platforms/android',
          packageImportPath: 'import org.pgsqlite.SQLitePluginPackage;',
          packageInstance: 'new SQLitePluginPackage()'
        }
      }
    }
  }
};
