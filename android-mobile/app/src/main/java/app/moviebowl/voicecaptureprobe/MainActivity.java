package app.moviebowl.voicecaptureprobe;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.TextView;

public final class MainActivity extends Activity {
    public static final String EXTRA_LIST_NAME = "itemListName";
    public static final String EXTRA_ITEM_NAME = "itemListElementName";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        renderIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        renderIntent(intent);
    }

    void renderIntent(Intent intent) {
        String listName = intent == null ? null : intent.getStringExtra(EXTRA_LIST_NAME);
        String itemName = intent == null ? null : intent.getStringExtra(EXTRA_ITEM_NAME);
        String action = intent == null ? null : intent.getAction();

        setText(R.id.list_name_value, displayValue(listName));
        setText(R.id.item_name_value, displayValue(itemName));
        setText(R.id.intent_action_value, displayValue(action));
        setText(
            R.id.capture_status,
            itemName == null ? getString(R.string.status_waiting) : getString(R.string.status_received)
        );
    }

    private void setText(int viewId, String value) {
        TextView view = findViewById(viewId);
        view.setText(value);
    }

    static String displayValue(String value) {
        if (value == null) return "(not received)";
        if (value.isEmpty()) return "(empty string)";
        return value;
    }
}
