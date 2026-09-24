package edu.bridgew.tvkiosk

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

/**
 * The whole app: a fullscreen WebView pointed at the hub.
 *
 * Everything the user sees -- tiles, branding, idle behaviour -- is served by
 * the web app, so this shell rarely needs reinstalling. It exists only to put a
 * browser on screen that the server can foreground on demand:
 *
 *   adb shell am start -n edu.bridgew.tvkiosk/.MainActivity
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.web)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            // The hub sizes itself to the viewport; don't let the WebView
            // second-guess it with desktop-width heuristics.
            useWideViewPort = true
            loadWithOverviewMode = true
        }
        // Keep every navigation inside the shell -- no external browser handoff.
        web.webViewClient = WebViewClient()
        web.setBackgroundColor(android.graphics.Color.BLACK)

        load()
        Sync.start(applicationContext)
    }

    private fun load() = web.loadUrl(Config.serverUrl(this))

    override fun onResume() {
        super.onResume()
        hideSystemUi()
        // Coming back from the setup screen, or being re-foregrounded by the
        // server, should land on a current page rather than a stale one.
        if (web.url != Config.serverUrl(this)) load()
    }

    /**
     * No visible settings affordance -- this is a kiosk. Setup opens on a
     * deliberate combination a viewer will not hit by accident.
     */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_MENU ||
            (keyCode == KeyEvent.KEYCODE_DPAD_CENTER && event?.isLongPress == true)
        ) {
            startActivity(Intent(this, SetupActivity::class.java))
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    /** Back inside the hub navigates the page; it must never exit the shell. */
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack()
    }

    private fun hideSystemUi() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
    }
}
