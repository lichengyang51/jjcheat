//
//  PikafishBridge.h
//  JJCheatApp —— 皮卡鱼引擎的 Objective-C 门面（Swift 通过 bridging header 调它）
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface PikafishBridge : NSObject

/// 皮卡鱼在这个包里到底有没有编进去
+ (BOOL)available;

/// 给一个 FEN（含走子方），返回 UCCI 着法（如 "h7e7"）；拿不到返回 nil
+ (nullable NSString *)bestMoveForFen:(NSString *)fen movetimeMs:(int)ms;

/// 局面变了清一下置换表里的旧东西（可选，不清也没问题）
+ (void)clear;

@end

NS_ASSUME_NONNULL_END
