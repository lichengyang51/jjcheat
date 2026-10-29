//
//  JJScreenGrabber.h
//  JJCheat
//
//  进程内全屏抓帧。三路回退：
//    1) CARenderServerRenderDisplay（越狱下最快最通用，GL/Metal/UIKit 通吃）
//    2) OpenGL ES presentRenderbuffer hook 缓存
//    3) CALayer renderInContext（只能抓到 UIKit 层，作为兜底）
//

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface JJScreenGrabber : NSObject

+ (instancetype)shared;

/** 开始抓帧 */
- (void)start;
- (void)stop;

/**
 * 取一帧 BGRA 像素（已转成 RGBA）
 * @param outW 输出宽度（像素）
 * @param outH 输出高度（像素）
 * @return RGBA 数据；失败返回 nil
 */
- (nullable NSData *)grabRGBAWithWidth:(int *)outW height:(int *)outH;

/** 当前走的是哪条路（调试用） */
@property (nonatomic, readonly) NSString *activeMethod;

/** 由 GL hook 调用，缓一帧 */
- (void)captureGLContext:(id)context target:(NSUInteger)target;

@end

NS_ASSUME_NONNULL_END
