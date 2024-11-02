module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
    ],
    // plugins: [
    //   [
    //     'module-resolver',
    //     {
    //       root: ['./src'],
    //       extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
    //       alias: {
    //         tests: ['./tests/'],
    //         "@components": "./components",
    //       }
    //     }
    //   ],
    //   'react-native-reanimated/plugin',
    // ]
  };
};
