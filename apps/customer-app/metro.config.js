const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// Same as Expo's default Metro config, plus the Sentry tags that let crash reports show readable file names.
module.exports = getSentryExpoConfig(__dirname);
