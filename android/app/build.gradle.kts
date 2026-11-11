import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing: the keystore and its passwords live only on the build server
// (/srv/sahaasra/shared/android), never in git. Point SAHAASRA_SIGNING at the properties file.
val signing = System.getenv("SAHAASRA_SIGNING")?.let { path ->
    Properties().apply { file(path).inputStream().use { load(it) } }
}

android {
    namespace = "com.astronlabs.sahaasra"
    compileSdk = 35

    defaultConfig {
        applicationId = "in.sahaasra.app"
        minSdk = 24
        targetSdk = 35
        versionCode = (System.getenv("SAHAASRA_VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("SAHAASRA_VERSION_NAME") ?: "1.0.0"
        // The only website the app opens and the only origin allowed to use the printer bridge.
        buildConfigField("String", "APP_URL", "\"https://app.sahaasra.in/\"")
        buildConfigField("String", "APP_ORIGIN", "\"https://app.sahaasra.in\"")
    }

    signingConfigs {
        if (signing != null) {
            create("release") {
                storeFile = file(signing.getProperty("storeFile"))
                storePassword = signing.getProperty("storePassword")
                keyAlias = signing.getProperty("keyAlias")
                keyPassword = signing.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (signing != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.12.1")
}
