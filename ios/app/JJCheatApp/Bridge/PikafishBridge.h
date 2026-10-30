//
//  PikafishBridge.h
//  JJCheatApp —— 皮卡鱼引擎的 Objective-C 门面
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface PikafishBridge : NSObject

/// 引擎在这个包里到底能不能用（会尝试 dlopen + 跑一步 50ms 验证）
+ (BOOL)available;

/// 给一个 FEN（含走子方），返回 UCCI 着法（如 "h7e7"）；拿不到返回 nil
+ (nullable NSString *)bestMove:(NSString *)fen movetimeMs:(int)ms;

/// 上一次加载/调用失败的原因（显示在界面上，方便定位）
+ (NSString *)lastError;

/// 强制重新尝试加载（用户点「测试引擎」时用）
+ (BOOL)retryLoad;

@end

NS_ASSUME_NONNULL_END
