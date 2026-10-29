//
//  JJEngineBridge.m
//  JJCheat
//

#import "JJEngineBridge.h"
#import "JJConfig.h"
#import <JavaScriptCore/JavaScriptCore.h>

@interface JJEngineBridge ()
@property (nonatomic, strong) JSContext *ctx;
@property (nonatomic, strong) dispatch_queue_t engineQueue;
@property (nonatomic, assign) BOOL loaded;
@property (nonatomic, assign) BOOL busy;
@end

@implementation JJEngineBridge

+ (instancetype)shared {
    static JJEngineBridge *s = nil;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ s = [[JJEngineBridge alloc] init]; });
    return s;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _engineQueue = dispatch_queue_create("com.fujiang.jjcheat.engine", DISPATCH_QUEUE_SERIAL);
        dispatch_set_target_queue(_engineQueue, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0));
        _loaded = NO;
        _busy = NO;
    }
    return self;
}

- (NSString *)locateEngineScript {
    NSFileManager *fm = [NSFileManager defaultManager];
    NSArray *candidates = @[
        JJ_ENGINE_PATH_ROOTLESS,
        JJ_ENGINE_PATH,
        [[NSBundle mainBundle] pathForResource:@"engine" ofType:@"js"],
    ];
    for (NSString *p in candidates) {
        if (p && [fm fileExistsAtPath:p]) return p;
    }
    return nil;
}

- (BOOL)loadEngine {
    if (self.loaded) return YES;
    NSString *path = [self locateEngineScript];
    if (!path) {
        NSLog(@"[JJCheat] 找不到 engine.js，请检查 %@", JJ_ENGINE_PATH);
        return NO;
    }
    NSError *err = nil;
    NSString *src = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:&err];
    if (!src) {
        NSLog(@"[JJCheat] 读取 engine.js 失败: %@", err);
        return NO;
    }
    dispatch_sync(self.engineQueue, ^{
        self.ctx = [[JSContext alloc] init];
        __weak typeof(self) weakSelf = self;
        self.ctx.exceptionHandler = ^(JSContext *c, JSValue *ex) {
            NSLog(@"[JJCheat] JS 异常: %@", [ex toString]);
            (void)weakSelf;
        };
        // 给 JS 端一个打日志的口子
        self.ctx[@"__nativeLog"] = ^(JSValue *msg) {
            NSLog(@"[JJCheat/js] %@", [msg toString]);
        };
        [self.ctx evaluateScript:src withSourceURL:[NSURL fileURLWithPath:path]];
        JSValue *engine = self.ctx[@"JJEngine"];
        self.loaded = !engine.isUndefined && !engine.isNull;
        NSLog(@"[JJCheat] engine.js 加载%@", self.loaded ? @"成功" : @"失败");
    });
    return self.loaded;
}

- (void)setCorners:(NSArray<NSArray<NSNumber *> *> *)corners {
    [self loadEngine];
    dispatch_async(self.engineQueue, ^{
        JSValue *fn = self.ctx[@"JJEngine"][@"setCorners"];
        [fn callWithArguments:@[corners ?: @[]]];
    });
}

- (void)resetWithFen:(NSString *)fen {
    [self loadEngine];
    dispatch_async(self.engineQueue, ^{
        JSValue *fn = self.ctx[@"JJEngine"][@"reset"];
        [fn callWithArguments:@[fen ?: [NSNull null]]];
    });
}

- (NSDictionary *)learnBoardWithPixels:(NSData *)rgba width:(int)w height:(int)h {
    if (![self loadEngine]) return nil;
    __block NSDictionary *out = nil;
    dispatch_sync(self.engineQueue, ^{
        JSContext *ctx = self.ctx;
        if (!ctx) return;
        JSValue *arrVal = [self makePixelArray:rgba width:w height:h];
        if (!arrVal) return;
        JSValue *fn = ctx[@"JJEngine"][@"learnBoard"];
        JSValue *res = [fn callWithArguments:@[arrVal, @(w), @(h)]];
        if (res && !res.isUndefined && !res.isNull) {
            out = [res toDictionary];
        }
    });
    return out;
}

- (void)processPixels:(NSData *)rgba
                width:(int)w
               height:(int)h
               timeMs:(int)timeMs
             callback:(JJEngineResultBlock)callback {
    if (![self loadEngine]) {
        if (callback) dispatch_async(dispatch_get_main_queue(), ^{ callback(nil, nil); });
        return;
    }
    if (self.busy) return;   // 上一帧还没算完，丢弃新帧（防堆积）
    self.busy = YES;

    __weak typeof(self) weakSelf = self;
    dispatch_async(self.engineQueue, ^{
        __strong typeof(weakSelf) self2 = weakSelf;
        if (!self2 || !self2.ctx) { self2.busy = NO; return; }
        JSContext *ctx = self2.ctx;
        JSValue *arrVal = [self2 makePixelArray:rgba width:w height:h];
        NSDictionary *result = nil;
        if (arrVal) {
            JSValue *fn = ctx[@"JJEngine"][@"process"];
            JSValue *opts = [JSValue valueWithNewObjectInContext:ctx];
            opts[@"timeMs"] = @(timeMs);
            opts[@"maxDiff"] = @(1);
            JSValue *res = [fn callWithArguments:@[arrVal, @(w), @(h), opts]];
            if (res && !res.isUndefined && !res.isNull) {
                result = [res toDictionary];
            }
        }
        self2.busy = NO;
        if (callback) {
            dispatch_async(dispatch_get_main_queue(), ^{ callback(result, nil); });
        }
    });
}

- (JSValue *)makePixelArray:(NSData *)rgba width:(int)w height:(int)h {
    JSContext *ctx = self.ctx;
    if (!ctx) return nil;
    NSUInteger need = (NSUInteger)w * (NSUInteger)h * 4;
    if (rgba.length < need) return nil;

    JSGlobalContextRef gc = ctx.JSGlobalContextRef;
    JSValueRef ex = NULL;
    JSObjectRef typed = JSObjectMakeTypedArray(gc, kJSTypedArrayTypeUint8ClampedArray, need, &ex);
    if (!typed || ex) return nil;
    void *bytes = JSObjectGetTypedArrayBytesPtr(gc, typed, NULL);
    if (!bytes) return nil;
    memcpy(bytes, rgba.bytes, need);
    return [JSValue valueWithJSValueRef:typed inContext:ctx];
}

- (NSArray<NSArray<NSNumber *> *> *)gridPoints {
    if (![self loadEngine]) return @[];
    __block NSArray *out = @[];
    dispatch_sync(self.engineQueue, ^{
        JSValue *fn = self.ctx[@"JJEngine"][@"gridPoints"];
        JSValue *res = [fn callWithArguments:@[]];
        NSArray *a = res ? [res toArray] : nil;
        if (a) out = a;
    });
    return out;
}

- (NSString *)currentFen {
    if (![self loadEngine]) return @"";
    __block NSString *out = @"";
    dispatch_sync(self.engineQueue, ^{
        JSValue *fn = self.ctx[@"JJEngine"][@"currentFen"];
        JSValue *res = [fn callWithArguments:@[]];
        if (res && res.isString) out = [res toString];
    });
    return out;
}

@end
