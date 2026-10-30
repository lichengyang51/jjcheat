//
//  EleeyeBridge.mm
//  JJCheatApp —— 调 ee_bridge.cpp（象眼引擎）
//

#import "EleeyeBridge.h"
#import <mutex>

extern "C" {
void ee_init(void);
int  ee_bestmove(const char *fen, int movetimeMs, char *out, int outLen);
}

static std::mutex g_mtx;
static NSString *g_err = @"未尝试";

@implementation EleeyeBridge

static BOOL g_checked = NO;
static BOOL g_ok = NO;

+ (BOOL)probe {
    char buf[32];
    buf[0] = 0;
    int rc = 0;
    {
        std::lock_guard<std::mutex> lock(g_mtx);
        rc = ee_bestmove("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w",
                         100, buf, sizeof(buf));
    }
    g_ok = (rc == 0 && buf[0] != 0);
    g_err = g_ok ? @"象眼已就绪" : [NSString stringWithFormat:@"象眼不可用 rc=%d", rc];
    g_checked = YES;
    NSLog(@"[JJCheat] %@", g_err);
    return g_ok;
}

+ (BOOL)available {
    if (!g_checked) [self probe];
    return g_ok;
}

+ (BOOL)retry {
    g_checked = NO;
    g_ok = NO;
    return [self probe];
}

+ (nullable NSString *)bestMove:(NSString *)fen movetimeMs:(int)ms {
    char buf[32];
    buf[0] = 0;
    int rc = 0;
    {
        std::lock_guard<std::mutex> lock(g_mtx);
        rc = ee_bestmove(fen.UTF8String, ms, buf, sizeof(buf));
    }
    if (rc != 0 || buf[0] == 0) {
        g_err = [NSString stringWithFormat:@"象眼算失败 rc=%d", rc];
        return nil;
    }
    return [NSString stringWithUTF8String:buf];
}

+ (NSString *)lastError {
    return g_err ?: @"未尝试";
}

@end
