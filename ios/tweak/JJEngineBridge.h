//
//  JJEngineBridge.h
//  JJCheat
//
//  JavaScriptCore 桥：把 RGBA 像素喂给打包好的 engine.js，
//  拿回 { 走法, 中文记谱, 分值, 胜率, 建议起止格 }
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^JJEngineResultBlock)(NSDictionary * _Nullable result, NSError * _Nullable error);

@interface JJEngineBridge : NSObject

+ (instancetype)shared;

/** 加载 engine.js，返回是否成功 */
- (BOOL)loadEngine;

/** 四点标定 [[x,y] x4]，顺序 左上/右上/右下/左下，屏幕像素坐标 */
- (void)setCorners:(NSArray<NSArray<NSNumber *> *> *)corners;

/** 重置到指定局面（nil = 标准开局） */
- (void)resetWithFen:(nullable NSString *)fen;

/** 在「正好是标准开局」的画面上学习棋盘背景与棋子模板 */
- (nullable NSDictionary *)learnBoardWithPixels:(NSData *)rgba
                                          width:(int)w
                                         height:(int)h;

/**
 * 处理一帧。异步执行（引擎搜索会占用几百毫秒），回调在主线程。
 */
- (void)processPixels:(NSData *)rgba
                width:(int)w
               height:(int)h
               timeMs:(int)timeMs
             callback:(JJEngineResultBlock)callback;

/** 90 个交叉点的屏幕像素坐标 */
- (NSArray<NSArray<NSNumber *> *> *)gridPoints;

/** 当前局面 FEN */
- (NSString *)currentFen;

@end

NS_ASSUME_NONNULL_END
