package edu.bridgew.tvhub;

import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.media.tv.TvInputInfo;
import android.media.tv.TvInputManager;
import android.media.tv.TvContract;
import android.net.Uri;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * Capacitor bridge that switches the Sony Bravia's active HDMI source.
 *
 * Mapping (set in HdmiPicker.tsx):
 *   Wall HDMI 1  →  port 3  (HDMI 3 on the physical TV panel)
 *   Wall HDMI 2  →  port 4  (HDMI 4 on the physical TV panel)
 *
 * Usage from JavaScript:
 *   TvInput.switchInput({ port: 3 })
 */
@CapacitorPlugin(name = "TvInput")
public class TvInputPlugin extends Plugin {

    private static final String TAG = "TvInputPlugin";

    @PluginMethod
    public void listInputs(PluginCall call) {
        TvInputManager tim = (TvInputManager) getContext().getSystemService(Context.TV_INPUT_SERVICE);
        if (tim == null) {
            call.reject("TvInputManager not available on this device");
            return;
        }

        JSArray arr = new JSArray();
        for (TvInputInfo info : tim.getTvInputList()) {
            JSObject item = new JSObject();
            item.put("id", info.getId());
            item.put("type", info.getType());
            item.put("label", info.loadLabel(getContext()).toString());
            arr.put(item);
        }
        JSObject result = new JSObject();
        result.put("inputs", arr);
        call.resolve(result);
    }

    @PluginMethod
    public void switchInput(PluginCall call) {
        Integer port = call.getInt("port");
        if (port == null) {
            call.reject("Missing required parameter: port");
            return;
        }

        Context ctx = getContext();
        TvInputManager tim = (TvInputManager) ctx.getSystemService(Context.TV_INPUT_SERVICE);
        if (tim == null) {
            call.reject("TvInputManager not available on this device");
            return;
        }

        List<TvInputInfo> inputs = tim.getTvInputList();
        Log.d(TAG, "Searching " + inputs.size() + " TV inputs for HDMI port " + port);

        String targetInputId = findHdmiInputId(inputs, port);

        if (targetInputId == null) {
            StringBuilder sb = new StringBuilder("Available inputs: ");
            for (TvInputInfo info : inputs) {
                sb.append("[").append(info.getId()).append(" type=").append(info.getType()).append("] ");
            }
            Log.w(TAG, "HDMI " + port + " not found. " + sb);
            call.reject("HDMI port " + port + " input not found. Available: " + sb);
            return;
        }

        Log.d(TAG, "Found input for HDMI " + port + ": " + targetInputId);

        long channelId = queryFirstChannelForInput(ctx, targetInputId);
        if (channelId < 0) {
            call.reject("No channels registered for input " + targetInputId);
            return;
        }

        Uri channelUri = TvContract.buildChannelUri(channelId);
        Intent intent = new Intent(Intent.ACTION_VIEW, channelUri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(intent);

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("inputId", targetInputId);
        result.put("channelId", channelId);
        call.resolve(result);
    }

    private String findHdmiInputId(List<TvInputInfo> inputs, int port) {
        for (TvInputInfo info : inputs) {
            if (info.getType() == TvInputInfo.TYPE_HDMI) {
                String id = info.getId();
                if (id.contains("HW" + port) || id.endsWith("/" + port) || id.endsWith(":" + port)) {
                    return id;
                }
            }
        }
        return null;
    }

    private long queryFirstChannelForInput(Context ctx, String inputId) {
        String[] projection = {TvContract.Channels._ID};
        String selection = TvContract.Channels.COLUMN_INPUT_ID + "=?";
        String[] args = {inputId};

        try (Cursor cursor = ctx.getContentResolver().query(
                TvContract.Channels.CONTENT_URI, projection, selection, args, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                return cursor.getLong(0);
            }
        } catch (Exception e) {
            Log.e(TAG, "Channel query failed", e);
        }
        return -1;
    }
}
