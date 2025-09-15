const path = require('path');

module.exports = {
  resolve: {
    fallback: {
      "react-native-fs": false,
      "react-native-vector-icons": false,
    },
    alias: {
      "react-native-fs": path.resolve(__dirname, "src/adapters/WebAdapters.js"),
      "react-native-vector-icons": path.resolve(__dirname, "src/adapters/WebAdapters.js"),
    }
  }
};
