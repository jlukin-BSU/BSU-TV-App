import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/**
 * Release signing.
 *
 * Credentials come from keystore.properties (gitignored), or from environment
 * variables so a build host can supply them without a file on disk. Neither the
 * keystore nor its password is ever committed.
 *
 * Every unit in the fleet must be signed with the SAME key. Android refuses an
 * update signed by a different one, and the only recovery is uninstalling the
 * app from every display -- so losing this key is expensive, not annoying.
 */
val keystoreProps = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

fun signingValue(key: String, env: String): String? =
    keystoreProps.getProperty(key) ?: System.getenv(env)

val releaseStoreFile = signingValue("storeFile", "BSU_KEYSTORE_FILE")
val releaseStorePassword = signingValue("storePassword", "BSU_KEYSTORE_PASSWORD")
val releaseKeyAlias = signingValue("keyAlias", "BSU_KEY_ALIAS")
val releaseKeyPassword = signingValue("keyPassword", "BSU_KEY_PASSWORD")
val hasReleaseSigning =
    releaseStoreFile != null && releaseStorePassword != null &&
        releaseKeyAlias != null && releaseKeyPassword != null

android {
    namespace = "edu.bridgew.tvkiosk"
    compileSdk = 34

    defaultConfig {
        applicationId = "edu.bridgew.tvkiosk"
        // Android TV back to Lollipop; the Google TV Streamer is API 34.
        minSdk = 21
        targetSdk = 34
        // Must increase for every build pushed to the fleet: Android only installs
        // an update over a higher versionCode, and the server refuses equal ones.
        versionCode = 2
        versionName = "0.2.0"

        // Baked default. Overridable at runtime from the setup screen.
        buildConfigField("String", "DEFAULT_SERVER_URL", "\"http://its-avctrl-bsu-av/\"")
    }

    buildFeatures { buildConfig = true }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseStoreFile!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
}

/**
 * Fail a release build that has no signing config, rather than quietly emitting
 * an unsigned APK that cannot be installed as an update.
 */
tasks.matching { it.name == "assembleRelease" || it.name == "bundleRelease" }.configureEach {
    doFirst {
        if (!hasReleaseSigning) {
            throw GradleException(
                "No release signing configured. Copy keystore.properties.example to " +
                    "keystore.properties and fill it in, or set BSU_KEYSTORE_FILE, " +
                    "BSU_KEYSTORE_PASSWORD, BSU_KEY_ALIAS and BSU_KEY_PASSWORD. " +
                    "Never commit either.",
            )
        }
    }
}
