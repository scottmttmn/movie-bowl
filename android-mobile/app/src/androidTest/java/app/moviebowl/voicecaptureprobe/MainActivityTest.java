package app.moviebowl.voicecaptureprobe;

import android.content.Intent;
import android.widget.TextView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Test;
import org.junit.runner.RunWith;

import static org.junit.Assert.assertEquals;

@RunWith(AndroidJUnit4.class)
public final class MainActivityTest {
    @Test
    public void testDisplaysExactAppActionExtras() {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setClassName(
            "app.moviebowl.voicecaptureprobe",
            "app.moviebowl.voicecaptureprobe.MainActivity"
        );
        intent.putExtra(MainActivity.EXTRA_LIST_NAME, "Movie Bowl");
        intent.putExtra(
            MainActivity.EXTRA_ITEM_NAME,
            "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb"
        );

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(intent)) {
            scenario.onActivity(activity -> {
                assertText(activity, R.id.capture_status, "Invocation received");
                assertText(activity, R.id.list_name_value, "Movie Bowl");
                assertText(
                    activity,
                    R.id.item_name_value,
                    "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb"
                );
                assertText(activity, R.id.intent_action_value, Intent.ACTION_VIEW);
            });
        }
    }

    @Test
    public void testNormalLaunchDoesNotInventCaptureValues() {
        Intent intent = new Intent(Intent.ACTION_MAIN);
        intent.setClassName(
            "app.moviebowl.voicecaptureprobe",
            "app.moviebowl.voicecaptureprobe.MainActivity"
        );

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(intent)) {
            scenario.onActivity(activity -> {
                assertText(activity, R.id.capture_status, "Waiting for a movie title");
                assertText(activity, R.id.list_name_value, "(not received)");
                assertText(activity, R.id.item_name_value, "(not received)");
            });
        }
    }

    private static void assertText(MainActivity activity, int viewId, String expected) {
        TextView view = activity.findViewById(viewId);
        assertEquals(expected, view.getText().toString());
    }
}
