package com.bbogush.web_screen;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.OrientationEventListener;
import android.view.WindowManager;

import java.nio.ByteBuffer;
import java.util.concurrent.atomic.AtomicBoolean;

public class ScreenCapture {
    private static final String VIRTUAL_DISPLAY_NAME = "ScreenCaptureVirtualDisplay";

    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay = null;
    private ImageReader imageReader = null;

    Context context;
    private Display display;
    private DisplayMetrics screenMetrics = new DisplayMetrics();
    private OrientationChangeCallback orientationChangeCallback = null;
    private int rotation;

    private Handler handler = null;

    private Bitmap bitmap = null;
    public AtomicBoolean bitmapDataLock = new AtomicBoolean(false);

    public ScreenCapture(MediaProjection mediaProjection, Context context) {
        this.mediaProjection = mediaProjection;
        this.context = context;

        WindowManager wm = (WindowManager)context.getSystemService(Context.WINDOW_SERVICE);
        display = wm.getDefaultDisplay();
    }

    public void start() {
        new Thread() {
            @Override
            public void run() {
                Looper.prepare();
                handler = new Handler();
                Looper.loop();
            }
        }.start();

        createVirtualDisplay();

        orientationChangeCallback = new OrientationChangeCallback(context);
        if (orientationChangeCallback.canDetectOrientation()) {
            orientationChangeCallback.enable();
        }
        rotation = display.getRotation();

        mediaProjection.registerCallback(new MediaProjectionStopCallback(), handler);
    }

    public void stop() {
        handler.post(new Runnable() {
            @Override
            public void run() {
                mediaProjection.stop();
            }
        });
    }

    private void createVirtualDisplay() {
        display.getMetrics(screenMetrics);

        imageReader = ImageReader.newInstance(screenMetrics.widthPixels,
                screenMetrics.heightPixels, PixelFormat.RGBA_8888, 2);

        virtualDisplay = mediaProjection.createVirtualDisplay(VIRTUAL_DISPLAY_NAME,
                screenMetrics.widthPixels, screenMetrics.heightPixels, screenMetrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_PRESENTATION, imageReader.getSurface(),
                null, handler);

        imageReader.setOnImageAvailableListener(new ImageAvailableListener(), handler);
    }

    private void releaseVirtualDisplay() {
        if (virtualDisplay != null)
            virtualDisplay.release();
        if (imageReader != null)
            imageReader.setOnImageAvailableListener(null, null);
    }

    private class ImageAvailableListener implements ImageReader.OnImageAvailableListener {
        @Override
        public void onImageAvailable(ImageReader reader) {
            synchronized (bitmapDataLock) {
                Image image = imageReader.acquireLatestImage();
                if (image != null) {
                    processScreenImage(image);
                    image.close();
                }
            }
        }
    }

    private void processScreenImage(Image image) {
        Image.Plane[] planes = image.getPlanes();
        ByteBuffer buffer = planes[0].getBuffer();
        int width = planes[0].getRowStride() / planes[0].getPixelStride();

        synchronized (bitmapDataLock) {
            if (width > image.getWidth()) {
                Bitmap tempBitmap = Bitmap.createBitmap(width, image.getHeight(),
                        Bitmap.Config.ARGB_8888);
                tempBitmap.copyPixelsFromBuffer(buffer);
                bitmap = Bitmap.createBitmap(tempBitmap, 0, 0, image.getWidth(),
                        image.getHeight());
            } else {
                bitmap = Bitmap.createBitmap(image.getWidth(), image.getHeight(),
                        Bitmap.Config.ARGB_8888);
                bitmap.copyPixelsFromBuffer(planes[0].getBuffer());
            }
        }
    }

    private class MediaProjectionStopCallback extends MediaProjection.Callback {
        @Override
        public void onStop() {
            handler.post(new Runnable() {
                @Override
                public void run() {
                    releaseVirtualDisplay();
                    if (orientationChangeCallback != null)
                        orientationChangeCallback.disable();
                    mediaProjection.unregisterCallback(MediaProjectionStopCallback.this);
                }
            });
        }
    }

    private class OrientationChangeCallback extends OrientationEventListener {

        OrientationChangeCallback(Context context) {
            super(context);
        }

        @Override
        public void onOrientationChanged(int orientation) {
            final int r = display.getRotation();
            if (r != rotation) {
                rotation = r;
                try {
                    releaseVirtualDisplay();
                    createVirtualDisplay();
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }
    }

    public Bitmap getBitmap() {
        return bitmap;
    }
}
