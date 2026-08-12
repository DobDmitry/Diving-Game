package ru.fvvsr.diving10m;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

/**
 * Тонкая нативная оболочка: игра целиком лежит в assets/index.html и работает офлайн.
 * Всё, что здесь есть, — то, чего HTML сам сделать не может: ориентация, кнопка «Назад»,
 * удержание экрана и разрешение звука без отдельного жеста.
 */
public class MainActivity extends Activity {

    private WebView web;
    private long lastBack = 0L;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        // прыжок длится пару секунд, но между попытками экран гаснуть не должен
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);                    // localStorage: рекорды переживают перезапуск
        ws.setAllowFileAccess(true);
        ws.setMediaPlaybackRequiresUserGesture(false);    // WebAudio стартует без лишнего жеста
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        ws.setTextZoom(100);                              // системный размер шрифта не ломает вёрстку

        web.setBackgroundColor(0xFFF5F9FD);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setLongClickable(false);
        web.setHapticFeedbackEnabled(false);

        web.loadUrl("file:///android_asset/index.html");
        setContentView(web);
    }

    /** Первое «Назад» — предупреждение, второе — выход. Иначе легко вылететь посреди прыжка. */
    @Override
    public void onBackPressed() {
        long now = System.currentTimeMillis();
        if (now - lastBack < 2000L) {
            super.onBackPressed();
            return;
        }
        lastBack = now;
        Toast.makeText(this, "Нажмите «Назад» ещё раз, чтобы выйти", Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
