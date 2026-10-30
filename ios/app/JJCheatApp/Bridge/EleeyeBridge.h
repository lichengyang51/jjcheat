//
//  EleeyeBridge.h
//  JJCheatApp —— 象眼（ElephantEye）引擎门面
//
//  纯 C++ 引擎，不依赖数据文件，静态链接即用。
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface EleeyeBridge : NSObject

/// 引擎能不能用（跑一步 100ms 试探）
+ (BOOL)available;

/// 给 FEN（含走子方）算出 UCCI 着法，如 "h2e2"；失败返回 nil
+ (nullable NSString *)bestMove:(NSString *)fen movetimeMs:(int)ms;

/// 重新探测一次（抽屉里的「重试引擎」用）
+ (BOOL)retry;

/// 上一次失败原因（显示在抽屉里）
+ (NSString *)lastError;

@end

NS_ASSUME_NONNULL_END
