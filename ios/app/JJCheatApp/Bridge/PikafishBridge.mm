//
//  PikafishBridge.mm
//  JJCheatApp —— 调 C++ 桥接层 pf_bridge.cpp
//

#import "PikafishBridge.h"

extern "C" {
void pf_init(void);
void pf_clear(void);
int  pf_bestmove(const char *fen, int movetimeMs, char *out, int outLen);
}

@implementation PikafishBridge

+ (BOOL)available {
    char buf[32];
    int rc = pf_bestmove("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w", 30, buf, sizeof(buf));
    return rc == 0;
}

+ (NSString *)bestMoveForFen:(NSString *)fen movetimeMs:(int)ms {
    char buf[32];
    buf[0] = 0;
    int rc = pf_bestmove(fen.UTF8String, ms, buf, sizeof(buf));
    if (rc != 0 || buf[0] == 0) return nil;
    return [NSString stringWithUTF8String:buf];
}

+ (void)clear {
    pf_clear();
}

@end
