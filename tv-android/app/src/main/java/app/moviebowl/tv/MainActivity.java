package app.moviebowl.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.SearchManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.util.List;
import java.util.Locale;
import java.util.Objects;

public final class MainActivity extends Activity {
    private static final long ROUTE_SETTLE_DELAY_MS = 180L;
    private static final String TV_BROWSER_STUB_PACKAGE =
        "com.android.tv.frameworkpackagestubs";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private FrameLayout rootView;
    private FrameLayout fullscreenContainer;
    private WebView webView;
    private View customFullscreenView;
    private WebChromeClient.CustomViewCallback customViewCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );
        enterImmersiveMode();

        rootView = new FrameLayout(this);
        rootView.setBackgroundColor(Color.BLACK);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setUserAgentString(
            settings.getUserAgentString() + " MovieBowlTV/0.1 AndroidTV"
        );

        if (BuildConfig.DEBUG) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.setWebViewClient(new MovieBowlWebViewClient());
        webView.setWebChromeClient(new MovieBowlWebChromeClient());

        fullscreenContainer = new FrameLayout(this);
        fullscreenContainer.setBackgroundColor(Color.BLACK);
        fullscreenContainer.setVisibility(View.GONE);

        rootView.addView(
            webView,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        rootView.addView(
            fullscreenContainer,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        setContentView(rootView);

        if (savedInstanceState == null) {
            webView.loadUrl(BuildConfig.TV_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }

        webView.requestFocus();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        enterImmersiveMode();
        webView.onResume();
        webView.requestFocus();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        mainHandler.removeCallbacksAndMessages(null);
        hideCustomFullscreenView();
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        String webKey = getWebKey(event.getKeyCode());
        if (webKey == null) return super.dispatchKeyEvent(event);

        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
                handleBackPress();
            } else {
                dispatchWebKey(webKey, event.getKeyCode());
            }
        }

        // Consume both key-down and key-up so WebView does not perform a second,
        // independent focus move after the React TV navigation handles the key.
        return true;
    }

    @Override
    public void onBackPressed() {
        handleBackPress();
    }

    private String getWebKey(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_LEFT:
                return "ArrowLeft";
            case KeyEvent.KEYCODE_DPAD_RIGHT:
                return "ArrowRight";
            case KeyEvent.KEYCODE_DPAD_UP:
                return "ArrowUp";
            case KeyEvent.KEYCODE_DPAD_DOWN:
                return "ArrowDown";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_BUTTON_A:
                return "Enter";
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
                return "Escape";
            default:
                return null;
        }
    }

    private void handleBackPress() {
        if (customFullscreenView != null) {
            hideCustomFullscreenView();
            return;
        }

        dispatchWebKey("Escape", KeyEvent.KEYCODE_ESCAPE);
        mainHandler.postDelayed(this::finishIfWebAppExitedTvMode, ROUTE_SETTLE_DELAY_MS);
    }

    private void dispatchWebKey(String key, int keyCode) {
        if (webView == null) return;

        String script =
            "(function(){" +
            "const key='" + key + "';" +
            "const event=new KeyboardEvent('keydown', {" +
                "key:'" + key + "'," +
                "keyCode:" + keyCode + "," +
                "which:" + keyCode + "," +
                "bubbles:true," +
                "cancelable:true" +
            "});" +
            "const handled=!window.dispatchEvent(event);" +
            "if(handled)return;" +
            "const active=document.activeElement;" +
            "if(key==='Enter'){" +
                "if(active&&active.matches('button,a[href],[role=button]')){" +
                    "active.click();return;" +
                "}" +
                "if(active&&active.form){" +
                    "if(typeof active.form.requestSubmit==='function'){" +
                        "active.form.requestSubmit();" +
                    "}else{" +
                        "active.form.submit();" +
                    "}" +
                    "return;" +
                "}" +
            "}" +
            "if(!key.startsWith('Arrow'))return;" +
            "const selector=" +
                "'input:not(:disabled),button:not(:disabled),a[href],' +" +
                "'[role=button],[tabindex]:not([tabindex=\"-1\"])';" +
            "const items=Array.from(document.querySelectorAll(selector))" +
                ".filter((item)=>{" +
                    "const style=getComputedStyle(item);" +
                    "return !item.hidden&&style.display!=='none'&&" +
                        "style.visibility!=='hidden';" +
                "});" +
            "if(items.length===0)return;" +
            "const step=(key==='ArrowLeft'||key==='ArrowUp')?-1:1;" +
            "let index=items.indexOf(active);" +
            "if(index<0)index=step>0?-1:items.length;" +
            "const next=items[(index+step+items.length)%items.length];" +
            "next.focus();" +
            "next.scrollIntoView({block:'nearest',inline:'nearest'});" +
            "})();";
        webView.evaluateJavascript(script, null);
    }

    private void finishIfWebAppExitedTvMode() {
        if (webView == null) return;

        webView.evaluateJavascript("window.location.pathname", value -> {
            if ("\"/\"".equals(value) || value.startsWith("\"/login")) {
                finish();
            }
        });
    }

    private void enterImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    private boolean isMovieBowlOrigin(Uri uri) {
        Uri appUri = Uri.parse(BuildConfig.TV_URL);
        return Objects.equals(appUri.getScheme(), uri.getScheme())
            && Objects.equals(appUri.getHost(), uri.getHost())
            && normalizedPort(appUri) == normalizedPort(uri);
    }

    private int normalizedPort(Uri uri) {
        if (uri.getPort() >= 0) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private boolean openExternal(Uri uri) {
        if (uri == null) return true;
        if (isMovieBowlOrigin(uri)) return false;

        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.addCategory(Intent.CATEGORY_BROWSABLE);

        String query = getSearchQuery(uri);
        if (query != null) {
            // Some television apps honor one of these standard search extras
            // even when their web-link filter accepts every path.
            intent.putExtra(SearchManager.QUERY, query);
            intent.putExtra("query", query);
            intent.putExtra(Intent.EXTRA_TEXT, query);
        }

        String providerPackage = getProviderPackageName(uri);
        if (providerPackage != null && isPackageInstalled(providerPackage)) {
            intent.setPackage(providerPackage);
        } else if (!hasUsableExternalHandler(intent)) {
            notifyProviderLaunchError(
                getProviderName(uri) + " isn't installed on this TV."
            );
            return true;
        }

        try {
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            notifyProviderLaunchError(
                getProviderName(uri) + " could not be opened on this TV."
            );
        }
        return true;
    }

    private boolean hasUsableExternalHandler(Intent intent) {
        List<ResolveInfo> handlers = getPackageManager().queryIntentActivities(
            intent,
            android.content.pm.PackageManager.MATCH_DEFAULT_ONLY
        );

        for (ResolveInfo handler : handlers) {
            String packageName = handler.activityInfo != null
                ? handler.activityInfo.packageName
                : null;
            if (
                packageName != null &&
                !TV_BROWSER_STUB_PACKAGE.equals(packageName) &&
                !getPackageName().equals(packageName)
            ) {
                return true;
            }
        }

        return false;
    }

    private boolean isPackageInstalled(String packageName) {
        try {
            return getPackageManager().getApplicationInfo(packageName, 0).enabled;
        } catch (android.content.pm.PackageManager.NameNotFoundException error) {
            return false;
        }
    }

    private String getSearchQuery(Uri uri) {
        for (String key : new String[] { "q", "query", "term" }) {
            String value = uri.getQueryParameter(key);
            if (value != null && !value.trim().isEmpty()) return value.trim();
        }
        return null;
    }

    private String getProviderName(Uri uri) {
        String host = String.valueOf(uri.getHost()).toLowerCase(Locale.US);
        if (host.contains("max.com") || host.contains("hbomax.com")) return "Max";
        if (host.contains("netflix.com")) return "Netflix";
        if (host.contains("hulu.com")) return "Hulu";
        if (host.contains("disneyplus.com")) return "Disney+";
        if (host.contains("amazon.com")) return "Prime Video";
        if (host.contains("tv.apple.com")) return "Apple TV+";
        if (host.contains("paramountplus.com")) return "Paramount+";
        if (host.contains("peacocktv.com")) return "Peacock";
        return "That streaming app";
    }

    private String getProviderPackageName(Uri uri) {
        String host = String.valueOf(uri.getHost()).toLowerCase(Locale.US);
        if (host.contains("max.com") || host.contains("hbomax.com")) {
            return "com.wbd.stream";
        }
        if (host.contains("netflix.com")) return "com.netflix.ninja";
        if (host.contains("hulu.com")) return "com.hulu.livingroomplus";
        if (host.contains("disneyplus.com")) return "com.disney.disneyplus";
        if (host.contains("amazon.com")) return "com.amazon.amazonvideo.livingroom";
        if (host.contains("tv.apple.com")) return "com.apple.atve.androidtv.appletv";
        if (host.contains("paramountplus.com")) return "com.cbs.ott";
        if (host.contains("peacocktv.com")) return "com.peacocktv.peacockandroid";
        return null;
    }

    private void notifyProviderLaunchError(String message) {
        if (webView == null) return;

        String script =
            "window.dispatchEvent(new CustomEvent(" +
            "'moviebowl:provider-launch-error'," +
            "{detail:{message:" + JSONObject.quote(message) + "}}));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void showCustomFullscreenView(
        View view,
        WebChromeClient.CustomViewCallback callback
    ) {
        if (customFullscreenView != null) {
            callback.onCustomViewHidden();
            return;
        }

        customFullscreenView = view;
        customViewCallback = callback;
        fullscreenContainer.addView(
            view,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        fullscreenContainer.setVisibility(View.VISIBLE);
        webView.setVisibility(View.GONE);
        enterImmersiveMode();
    }

    private void hideCustomFullscreenView() {
        if (customFullscreenView == null) return;

        fullscreenContainer.removeView(customFullscreenView);
        fullscreenContainer.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        customFullscreenView = null;

        if (customViewCallback != null) {
            customViewCallback.onCustomViewHidden();
            customViewCallback = null;
        }

        enterImmersiveMode();
        webView.requestFocus();
    }

    private final class MovieBowlWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(
            WebView view,
            WebResourceRequest request
        ) {
            return openExternal(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return openExternal(Uri.parse(url));
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            enterImmersiveMode();
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            view.requestFocus();
        }
    }

    private final class MovieBowlWebChromeClient extends WebChromeClient {
        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            showCustomFullscreenView(view, callback);
        }

        @Override
        public void onHideCustomView() {
            hideCustomFullscreenView();
        }

        @Override
        public boolean onCreateWindow(
            WebView view,
            boolean isDialog,
            boolean isUserGesture,
            Message resultMsg
        ) {
            WebView popupWebView = new WebView(MainActivity.this);
            popupWebView.setWebViewClient(new WebViewClient() {
                private boolean opened;

                private void openOnce(Uri uri) {
                    if (opened || uri == null) return;
                    opened = true;
                    openExternal(uri);
                    popupWebView.stopLoading();
                    popupWebView.destroy();
                }

                @Override
                public boolean shouldOverrideUrlLoading(
                    WebView childView,
                    WebResourceRequest request
                ) {
                    openOnce(request.getUrl());
                    return true;
                }

                @Override
                @SuppressWarnings("deprecation")
                public boolean shouldOverrideUrlLoading(
                    WebView childView,
                    String url
                ) {
                    openOnce(Uri.parse(url));
                    return true;
                }

                @Override
                public void onPageStarted(
                    WebView childView,
                    String url,
                    Bitmap favicon
                ) {
                    openOnce(Uri.parse(url));
                }
            });

            WebView.WebViewTransport transport =
                (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(popupWebView);
            resultMsg.sendToTarget();
            return true;
        }
    }
}
