//
//  JJHUDWindow.h
//  JJCheat
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, JJHUDMode) {
    JJHUDModeDisplay = 0,   // 只显示，不挡触摸
    JJHUDModeCalibrate,     // 四点标定，接收触摸
};

@interface JJHUDWindow : UIWindow

+ (instancetype)shared;

- (void)attach;

/** 显示一条分析结果 */
- (void)showResult:(NSDictionary *)result
          gridPoints:(NSArray<NSArray<NSNumber *> *> *)points
             fen:(NSString *)fen;

/** 顶部一条状态提示 */
- (void)showStatus:(NSString *)text;

/** 进入四点标定；完成后回调（屏幕 point 坐标四角） */
- (void)beginCalibrationWithCompletion:(void (^)(NSArray<NSValue *> *corners))completion;

/** 隐藏 / 显示整层 */
- (void)setHUDHidden:(BOOL)hidden;

@property (nonatomic, assign) JJHUDMode mode;

@end

NS_ASSUME_NONNULL_END
