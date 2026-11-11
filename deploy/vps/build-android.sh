#!/usr/bin/env bash
# Builds the SAHAASRA Android app (Bluetooth printing) on the server and publishes it at
#   https://app.sahaasra.in/downloads/android/SAHAASRA.apk
# Run as root after a deploy that changed android/:   bash /srv/sahaasra/app/deploy/vps/build-android.sh
#
# - Tools (Java 17, Android SDK, Gradle) are installed once under /opt.
# - The signing key is created once in /srv/sahaasra/shared/android (root only, never in git).
#   KEEP A COPY OF IT: Android only installs updates signed with the same key.
# - The build runs as root in its own folder, so the web app's user never sees the key.
set -euo pipefail

APP=/srv/sahaasra/app
SDK=/opt/android-sdk
GRADLE_VERSION=8.9
GRADLE=/opt/gradle-$GRADLE_VERSION/bin/gradle
KEYS=/srv/sahaasra/shared/android
OUT=/srv/sahaasra/shared/downloads/android
WORK=/var/lib/sahaasra-android

echo "== tools"
if ! command -v javac >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openjdk-17-jdk-headless unzip >/dev/null
fi
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  mkdir -p $SDK/cmdline-tools
  curl -fsSL -o /tmp/cmdline-tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
  unzip -q -o /tmp/cmdline-tools.zip -d $SDK/cmdline-tools
  rm -rf $SDK/cmdline-tools/latest && mv $SDK/cmdline-tools/cmdline-tools $SDK/cmdline-tools/latest
  rm -f /tmp/cmdline-tools.zip
fi
if [ ! -d "$SDK/platforms/android-35" ] || [ ! -d "$SDK/build-tools/35.0.0" ]; then
  yes | $SDK/cmdline-tools/latest/bin/sdkmanager --sdk_root=$SDK --licenses >/dev/null || true
  $SDK/cmdline-tools/latest/bin/sdkmanager --sdk_root=$SDK "platforms;android-35" "build-tools;35.0.0" >/dev/null
fi
if [ ! -x "$GRADLE" ]; then
  curl -fsSL -o /tmp/gradle.zip https://services.gradle.org/distributions/gradle-$GRADLE_VERSION-bin.zip
  unzip -q -o /tmp/gradle.zip -d /opt
  rm -f /tmp/gradle.zip
fi
java -version 2>&1 | head -1

echo "== signing key"
install -d -m 700 $KEYS
if [ ! -f $KEYS/release.jks ]; then
  PASS=$(openssl rand -hex 24)
  keytool -genkeypair -noprompt -keystore $KEYS/release.jks -storetype PKCS12 -storepass "$PASS" -keypass "$PASS" \
    -alias sahaasra -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=SAHAASRA, O=Astron Labs, C=IN" >/dev/null
  printf 'storeFile=%s\nstorePassword=%s\nkeyAlias=sahaasra\nkeyPassword=%s\n' "$KEYS/release.jks" "$PASS" "$PASS" >$KEYS/keystore.properties
  chmod 600 $KEYS/release.jks $KEYS/keystore.properties
  echo "Created a new signing key in $KEYS — back it up somewhere safe."
fi

echo "== build"
rm -rf $WORK/src && mkdir -p $WORK && cp -r $APP/android $WORK/src
cd $WORK/src
COUNT=$(git -C $APP rev-list --count HEAD)
export ANDROID_HOME=$SDK ANDROID_SDK_ROOT=$SDK SAHAASRA_SIGNING=$KEYS/keystore.properties
export SAHAASRA_VERSION_CODE=$COUNT SAHAASRA_VERSION_NAME="1.0.$COUNT"
export GRADLE_USER_HOME=$WORK/gradle-home
$GRADLE --no-daemon -q assembleRelease

echo "== publish"
install -d -m 755 -o sahaasra -g sahaasra /srv/sahaasra/shared/downloads $OUT
APK=$WORK/src/app/build/outputs/apk/release/app-release.apk
$SDK/build-tools/35.0.0/apksigner verify $APK
install -m 644 -o sahaasra -g sahaasra $APK $OUT/SAHAASRA.apk
printf '{"versionCode":%s,"versionName":"1.0.%s","size":%s,"builtAt":"%s"}\n' "$COUNT" "$COUNT" "$(stat -c %s $APK)" "$(date -u +%FT%TZ)" >$OUT/version.json
chown sahaasra:sahaasra $OUT/version.json
echo "ANDROID OK: version 1.0.$COUNT, $(du -h $OUT/SAHAASRA.apk | cut -f1)"
