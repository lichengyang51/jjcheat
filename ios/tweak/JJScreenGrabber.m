//
//  JJScreenGrabber.m
//  JJCheat
//

#import "JJScreenGrabber.h"
#import "JJConfig.h"
#import <IOSurface/IOSurface.h>
#import <QuartzCore/QuartzCore.h>
#import <OpenGLES/ES3/gl.h>
#import <OpenGLES/EAGL.h>
#import <dlfcn.h>
#import <mach/mach.h>
#import <os/lock.h>

/* ---------- CARenderServer 私有 API ---------- */
typedef mach_port_t (*CARenderServerGetServerPort_t)(mach_port_t);
typedef void (*CARenderServerRenderDisplay_t)(mach_port_t, CFStringRef, IOSurfaceRef, int, int);

static CARenderServerGetServerPort_t  s_getServerPort  = NULL;
static CARenderServerRenderDisplay_t  s_renderDisplay  = NULL;
static mach_port_t                    s_serverPort     = MACH_PORT_NULL;
static BOOL                           s_apiResolved    = NO;
static BOOL                           s_apiUsable      = NO;

@interface JJScreenGrabber () {
    IOSurfaceRef   _surface;
    int            _surfW;
    int            _surfH;
    NSData        *_glFrame;
    int            _glW;
    int            _glH;
    CFTimeInterval _glFrameTimestamp;
    os_unfair_lock _lock;
}
@property (nonatomic, strong) NSString *activeMethod;
@end

@implementation JJScreenGrabber

+ (instancetype)shared {
    static JJScreenGrabber *s = nil;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ s = [[JJScreenGrabber alloc] init]; });
    return s;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _lock = OS_UNFAIR_LOCK_INIT;
        _activeMethod = @"none";
        [self resolvePrivateAPI];
    }
    return self;
}

- (void)resolvePrivateAPI {
    if (s_apiResolved) return;
    s_apiResolved = YES;

    void *qc = dlopen("/System/Library/Frameworks/QuartzCore.framework/QuartzCore", RTLD_LAZY);
    s_renderDisplay = (CARenderServerRenderDisplay_t)(qc ? dlsym(qc, "CARenderServerRenderDisplay") : NULL);
    if (!s_renderDisplay) {
        s_renderDisplay = (CARenderServerRenderDisplay_t)dlsym(RTLD_DEFAULT, "CARenderServerRenderDisplay");
    }
    s_getServerPort = (CARenderServerGetServerPort_t)dlsym(RTLD_DEFAULT, "CARenderServerGetServerPort");
    if (!s_getServerPort) s_getServerPort = (CARenderServerGetServerPort_t)dlsym(RTLD_DEFAULT, "CARenderServerGetServerPort2");

    if (s_renderDisplay && s_getServerPort) {
        s_serverPort = s_getServerPort(MACH_PORT_NULL);
        s_apiUsable = (s_serverPort != MACH_PORT_NULL);
    }
    NSLog(@"[JJCheat] CARenderServer: render=%p port=%p usable=%d",
          s_renderDisplay, (void *)s_serverPort, s_apiUsable);
}

- (void)start {
    [self resolvePrivateAPI];
}

- (void)stop {
    if (_surface) {
        CFRelease(_surface);
        _surface = NULL;
        _surfW = _surfH = 0;
    }
}

- (CGSize)pixelSize {
    UIScreen *sc = [UIScreen mainScreen];
    CGSize s = sc.nativeBounds.size;
    if (s.width <= 0 || s.height <= 0) {
        s = CGSizeMake(sc.bounds.size.width * sc.scale, sc.bounds.size.height * sc.scale);
    }
    return s;
}

- (BOOL)ensureSurface:(int)w height:(int)h {
    if (_surface && _surfW == w && _surfH == h) return YES;
    if (_surface) { CFRelease(_surface); _surface = NULL; }

    NSDictionary *props = @{
        @"IOSurfaceWidth"           : @(w),
        @"IOSurfaceHeight"          : @(h),
        @"IOSurfaceBytesPerElement" : @(4),
        @"IOSurfaceBytesPerRow"     : @(w * 4),
        @"IOSurfaceAllocSize"       : @(w * h * 4),
        @"IOSurfacePixelFormat"     : @((uint32_t)0x42475241), /* 'BGRA' */
        @"IOSurfaceIsGlobal"        : @YES,
    };
    _surface = IOSurfaceCreate((__bridge CFDictionaryRef)props);
    if (!_surface) {
        NSLog(@"[JJCheat] IOSurfaceCreate 失败 (%dx%d)", w, h);
        return NO;
    }
    _surfW = w;
    _surfH = h;
    return YES;
}

/* BGRA -> RGBA 就地交换 R/B */
static void swapRB(uint32_t *p, size_t count) {
    for (size_t i = 0; i < count; i++) {
        uint32_t v = p[i];
        p[i] = (v & 0xFF00FF00u) | ((v & 0x000000FFu) << 16) | ((v >> 16) & 0x000000FFu);
    }
}

- (NSData *)grabViaRenderServerWithWidth:(int *)outW height:(int *)outH {
    if (!s_apiUsable || !s_renderDisplay) return nil;
    CGSize px = [self pixelSize];
    int w = (int)px.width, h = (int)px.height;
    if (w <= 0 || h <= 0) return nil;
    if (![self ensureSurface:w height:h]) return nil;

    s_renderDisplay(s_serverPort, CFSTR("LCD"), _surface, 0, 0);

    if (IOSurfaceLock(_surface, kIOSurfaceLockReadOnly, NULL) != KERN_SUCCESS) return nil;
    size_t bpr = IOSurfaceGetBytesPerRow(_surface);
    void *base = IOSurfaceGetBaseAddress(_surface);
    if (!base) { IOSurfaceUnlock(_surface, kIOSurfaceLockReadOnly, NULL); return nil; }

    size_t need = (size_t)w * h * 4;
    NSMutableData *out = [NSMutableData dataWithLength:need];
    uint8_t *dst = (uint8_t *)out.mutableBytes;
    if (bpr == (size_t)w * 4) {
        memcpy(dst, base, need);
    } else {
        for (int y = 0; y < h; y++) {
            memcpy(dst + (size_t)y * w * 4, (uint8_t *)base + (size_t)y * bpr, (size_t)w * 4);
        }
    }
    IOSurfaceUnlock(_surface, kIOSurfaceLockReadOnly, NULL);

    swapRB((uint32_t *)dst, (size_t)w * h);
    self.activeMethod = @"CARenderServer";
    if (outW) *outW = w;
    if (outH) *outH = h;
    return out;
}

- (void)captureGLContext:(id)context target:(NSUInteger)target {
    EAGLContext *ctx = (EAGLContext *)context;
    if (![ctx isKindOfClass:[EAGLContext class]]) return;
    if ([EAGLContext currentContext] != ctx) {
        [EAGLContext setCurrentContext:ctx];
    }
    GLint vp[4] = {0, 0, 0, 0};
    glGetIntegerv(GL_VIEWPORT, vp);
    int w = vp[2], h = vp[3];
    if (w <= 0 || h <= 0) return;
    size_t need = (size_t)w * h * 4;
    NSMutableData *buf = [NSMutableData dataWithLength:need];
    glPixelStorei(GL_PACK_ALIGNMENT, 1);
    glReadPixels(0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, buf.mutableBytes);
    // OpenGL 原点在左下，翻转成左上
    uint8_t *src = (uint8_t *)buf.mutableBytes;
    NSMutableData *flipped = [NSMutableData dataWithLength:need];
    uint8_t *dst = (uint8_t *)flipped.mutableBytes;
    size_t rowBytes = (size_t)w * 4;
    for (int y = 0; y < h; y++) {
        memcpy(dst + (size_t)y * rowBytes, src + (size_t)(h - 1 - y) * rowBytes, rowBytes);
    }
    os_unfair_lock_lock(&_lock);
    _glFrame = flipped;
    _glW = w; _glH = h;
    _glFrameTimestamp = CACurrentMediaTime();
    os_unfair_lock_unlock(&_lock);
}

- (NSData *)grabViaGLCacheWithWidth:(int *)outW height:(int *)outH {
    os_unfair_lock_lock(&_lock);
    NSData *f = _glFrame;
    int w = _glW, h = _glH;
    CFTimeInterval ts = _glFrameTimestamp;
    os_unfair_lock_unlock(&_lock);
    if (!f || w <= 0 || h <= 0) return nil;
    // 超过 1 秒的旧帧丢掉
    if (CACurrentMediaTime() - ts > 1.0) return nil;
    self.activeMethod = @"GL-hook";
    if (outW) *outW = w;
    if (outH) *outH = h;
    return f;
}

- (NSData *)grabViaLayerWithWidth:(int *)outW height:(int *)outH {
    UIWindow *win = nil;
    for (UIWindow *w in [UIApplication sharedApplication].windows) {
        if (w.isKeyWindow) { win = w; break; }
    }
    if (!win) win = [UIApplication sharedApplication].windows.firstObject;
    if (!win) return nil;

    CGSize px = [self pixelSize];
    int w = (int)px.width, h = (int)px.height;
    if (w <= 0 || h <= 0) return nil;

    size_t need = (size_t)w * h * 4;
    NSMutableData *out = [NSMutableData dataWithLength:need];
    CGColorSpaceRef cs = CGColorSpaceCreateDeviceRGB();
    CGContextRef cg = CGBitmapContextCreate(out.mutableBytes, w, h, 8, (size_t)w * 4, cs,
        kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
    CGColorSpaceRelease(cs);
    if (!cg) return nil;
    UIGraphicsPushContext(cg);
    CGContextTranslateCTM(cg, 0, h);
    CGContextScaleCTM(cg, (CGFloat)w / win.bounds.size.width, -(CGFloat)h / win.bounds.size.height);
    [win.layer renderInContext:cg];
    UIGraphicsPopContext();
    CGContextRelease(cg);

    self.activeMethod = @"CALayer";
    if (outW) *outW = w;
    if (outH) *outH = h;
    return out;
}

- (NSData *)grabRGBAWithWidth:(int *)outW height:(int *)outH {
    NSData *d = [self grabViaRenderServerWithWidth:outW height:outH];
    if (d && d.length) return d;
    d = [self grabViaGLCacheWithWidth:outW height:outH];
    if (d && d.length) return d;
    return [self grabViaLayerWithWidth:outW height:outH];
}

- (void)dealloc {
    if (_surface) CFRelease(_surface);
}

@end
