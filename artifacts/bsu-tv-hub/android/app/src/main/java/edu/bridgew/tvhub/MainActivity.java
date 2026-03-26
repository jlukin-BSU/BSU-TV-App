package edu.bridgew.tvhub;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(TvInputPlugin.class);
        registerPlugin(AppLauncherPlugin.class);
        registerPlugin(ScreenOffPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
