//
//  PikafishBridge.mm
//  JJCheatApp —— 皮卡鱼引擎的运行时加载器
//
//  ★ 为什么不静态链接 ★
//
//    皮卡鱼的 NNUE 网络是 namespace 级全局对象，进程一启动 dyld 就去构造它。
//    只要静态链接进来，这段代码就一定在启动路径上 —— 一旦它有任何问题
//    （找不到网络文件、文件系统调用抛异常、内存不够），用户看到的就是
//    「点图标闪退」，连界面都进不去，整包废掉。
//
//    所以改成：引擎编成 libpikafish.dylib 放进 App 的 Frameworks 目录，
//    启动时不加载；只有真正要算棋时才 dlopen。
//      - 加载成功 → 用它算
//      - 加载失败 → 返回 nil，退回云库 + 本机 JS 引擎，App 一切正常
//      - 就算它加载过程中把进程搞死，也只是这一次「开引擎」崩，
//        而且我们会在尝试前先写一个标记，下次启动不再自动尝试，App 永远能开。
//

#import "PikafishBridge.h"
#import <dlfcn.h>

typedef int (*PFBestmoveFn)(const char *fen, int movetimeMs, char *out, int outLen);
typedef void (*PFVoidFn)(void);

static void *g_lib = NULL;
static PFBestmoveFn g_bestmove = NULL;
static PFVoidFn g_clear = NULL;
static int g_state = 0;          // 0 未尝试 / 1 已加载 / -1 加载失败

@implementation PikafishBridge

+ (BOOL)loadEngine {
    if (g_state == 1) return YES;
    if (g_state == -1) return NO;

    // 先把「尝试过」写盘：万一 dlopen 期间进程被杀，下次启动看到这个标记
    // 就不再自动尝试，用户永远能打开 App。
    NSUserDefaults *d = [NSUserDefaults standardUserDefaults];
    [d setBool:YES forKey:@"pfTried"];
    [d synchronize];

    const char *candidates[] = {
        "@executable_path/Frameworks/libpikafish.dylib",
        "@executable_path/libpikafish.dylib",
        NULL
    };
    for (int i = 0; candidates[i] != NULL && !g_lib; i++) {
        g_lib = dlopen(candidates[i], RTLD_NOW | RTLD_LOCAL);
        if (!g_lib) {
            NSLog(@"[JJCheat] dlopen %s 失败: %s", candidates[i], dlerror());
        }
    }
    if (!g_lib) {
        g_state = -1;
        return NO;
    }
    g_bestmove = (PFBestmoveFn)dlsym(g_lib, "pf_bestmove");
    g_clear = (PFVoidFn)dlsym(g_lib, "pf_clear");
    if (!g_bestmove) {
        NSLog(@"[JJCheat] dylib 里没有 pf_bestmove");
        g_state = -1;
        return NO;
    }
    g_state = 1;
    NSLog(@"[JJCheat] 皮卡鱼 dylib 已加载");
    return YES;
}

+ (BOOL)available {
    static BOOL ok = NO;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        // 上次尝试过但没成功（可能崩过）→ 这次不再自动试，保证 App 能开
        BOOL tried = [[NSUserDefaults standardUserDefaults] boolForKey:@"pfTried"];
        BOOL done  = [[NSUserDefaults standardUserDefaults] boolForKey:@"pfOk"];
        if (done) { ok = [self loadEngine]; return; }
        if (tried) { NSLog(@"[JJCheat] 皮卡鱼上次尝试失败，跳过"); ok = NO; return; }

        if ([self loadEngine]) {
            // 真跑一步 50ms 验证网络文件能被读出来
            char buf[32];
            buf[0] = 0;
            if (g_bestmove("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w",
                           50, buf, sizeof(buf)) == 0 && buf[0]) {
                ok = YES;
                [[NSUserDefaults standardUserDefaults] setBool:YES forKey:@"pfOk"];
                [[NSUserDefaults standardUserDefaults] synchronize];
            }
        }
    });
    return ok;
}

+ (nullable NSString *)bestMove:(NSString *)fen movetimeMs:(int)ms {
    if (![self loadEngine] || !g_bestmove) return nil;
    char buf[32];
    buf[0] = 0;
    int rc = g_bestmove(fen.UTF8String, ms, buf, sizeof(buf));
    if (rc != 0 || buf[0] == 0) return nil;
    return [NSString stringWithUTF8String:buf];
}

+ (void)clear {
    if (g_clear) g_clear();
}

@end
