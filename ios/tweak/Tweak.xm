//
//  Tweak.xm
//  JJCheat —— 注入 JJ象棋 进程，抓画面、算棋、在棋盘上标注
//

#import <UIKit/UIKit.h>
#import <objc/runtime.h>
#import <OpenGLES/EAGL.h>
#import <QuartzCore/QuartzCore.h>

#import "JJController.h"
#import "JJScreenGrabber.h"
#import "JJHUDWindow.h"
#import "JJEngineBridge.h"

static BOOL gJJStarted = NO;

static void JJStartOnce(void) {
    if (gJJStarted) return;
    gJJStarted = YES;
    @try {
        [[JJController shared] start];
    } @catch (NSException *e) {
        NSLog(@"[JJCheat] 启动异常: %@", e);
    }
}

/* ============================================================
 *  OpenGL ES 抓帧（备用通道）
 *  cocos2d-x 用 EAGL 渲染，presentRenderbuffer 之后帧缓冲还在，
 *  此时 glReadPixels 可以拿到完整游戏画面。
 * ============================================================ */
%hook EAGLContext

- (BOOL)presentRenderbuffer:(NSUInteger)target {
    BOOL ret = %orig;
    static unsigned int sThrottle = 0;
    // 每 4 帧抓一次，避免拖慢游戏
    if (((sThrottle++) & 3u) == 0u) {
        @try {
            [[JJScreenGrabber shared] captureGLContext:self target:target];
        } @catch (NSException *e) {
            // 静默
        }
    }
    return ret;
}

%end

/* ============================================================
 *  兜底：如果 3 秒内没触发（APP 冷启动慢），用 didFinishLaunching 补一次
 * ============================================================ */
%hook UIApplication

- (BOOL)application:(UIApplication *)application
        didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    BOOL r = %orig;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(3.0 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
        JJStartOnce();
    });
    return r;
}

%end

/* ============================================================
 *  从后台恢复时把 HUD 窗口重新挂到前台 scene 上
 * ============================================================ */

/* ============================================================
 *  入口
 * ============================================================ */
%ctor {
    %init;

    NSLog(@"[JJCheat] tweak 已加载 (pid=%d)", getpid());

    [[NSNotificationCenter defaultCenter]
        addObserverForName:UIApplicationDidBecomeActiveNotification
                    object:nil
                     queue:[NSOperationQueue mainQueue]
                usingBlock:^(NSNotification *note) {
        // 每次回到前台，确保 HUD 没被系统 window 层级盖掉
        @try {
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.6 * NSEC_PER_SEC)),
                           dispatch_get_main_queue(), ^{
                [[JJHUDWindow shared] attach];
            });
        } @catch (NSException *e) {}
    }];

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(3.0 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
        JJStartOnce();
    });
}
