package edu.bridgew.tvkiosk

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Operator-only screen for pointing a unit at a different hub server.
 *
 * Production units run the baked-in default and never see this. It exists for
 * bench and test units, and is reached from the hub with MENU (or a long press
 * on the D-pad centre) rather than any on-screen control.
 */
class SetupActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)

        val field = findViewById<EditText>(R.id.serverUrl)
        val current = findViewById<TextView>(R.id.current)

        field.setText(if (Config.isOverridden(this)) Config.serverUrl(this) else "")
        field.hint = Config.defaultServerUrl()
        current.text = getString(
            R.string.setup_current,
            Config.serverUrl(this),
            if (Config.isOverridden(this)) "override" else "build default"
        )

        findViewById<Button>(R.id.save).setOnClickListener {
            Config.setServerUrl(this, field.text.toString())
            finish()
        }
        findViewById<Button>(R.id.reset).setOnClickListener {
            Config.setServerUrl(this, null)
            finish()
        }
    }
}
