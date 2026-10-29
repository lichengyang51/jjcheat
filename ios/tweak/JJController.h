//
//  JJController.h
//  JJCheat
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface JJController : NSObject

+ (instancetype)shared;

/** 启动：延迟等 APP 界面就绪后接管 */
- (void)start;
- (void)stop;

/** 强制重新标定 */
- (void)recalibrate;

/** 重置到标准开局 */
- (void)resetToStartPosition;

@end

NS_ASSUME_NONNULL_END
