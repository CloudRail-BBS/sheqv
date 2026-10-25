package com.cloudrail.community;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FileBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
