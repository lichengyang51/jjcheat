//
//  JJController.m
//  JJCheat
//

#import "JJController.h"
#import "JJConfig.h"
#import "JJEngineBridge.h"
#import "JJScreenGrabber.h"
#import "JJHUDWindow.h"
#import <UIKit/UIKit.h>

typedef NS_ENUM(NSInteger, JJCtrlState) {
    JJCtrlStateIdle = 0,
    JJCtrlStateCalibrating,
    JJCtrlStateWaitingBoard,   // 已标定，等用户进入一局新棋
    JJCtrlStateRunning,
};

/* ============================================================
 *  悬浮球 —— 用来控制显隐 / 重新标定 / 重置
 * ============================================================ */
@interface JJBallWindow : UIWindow
@property (nonatomic, strong) UIButton *ball;
@property (nonatomic, copy) void (^onTap)(void);
@property (nonatomic, copy) void (^onLongPress)(void);
@end

@implementation JJBallWindow

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        self.windowLevel = UIWindowLevelAlert + 1001.0;
        self.backgroundColor = [UIColor clearColor];
        self.rootViewController = [[UIViewController alloc] init];
        self.rootViewController.view.backgroundColor = [UIColor clearColor];

        CGFloat d = 52;
        CGRect scr = [UIScreen mainScreen].bounds;
        _ball = [UIButton buttonWithType:UIButtonTypeCustom];
        _ball.frame = CGRectMake(0, 0, d, d);
        _ball.center = CGPointMake(scr.size.width - 34, scr.size.height * 0.45);
        _ball.backgroundColor = [UIColor colorWithRed:0.85 green:0.1 blue:0.2 alpha:0.85];
        _ball.layer.cornerRadius = d / 2;
        _ball.layer.borderWidth = 2;
        _ball.layer.borderColor = [UIColor colorWithWhite:1 alpha:0.7].CGColor;
        _ball.titleLabel.font = [UIFont boldSystemFontOfSize:17];
        _ball.titleLabel.numberOfLines = 2;
        [_ball setTitle:@"象\n棋" forState:UIControlStateNormal];
        [_ball setTitleColor:[UIColor whiteColor] forState:UIControlStateNormal];
        [_ball addTarget:self action:@selector(tapBall) forControlEvents:UIControlEventTouchUpInside];

        UIPanGestureRecognizer *pan = [[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(panBall:)];
        [_ball addGestureRecognizer:pan];
        UILongPressGestureRecognizer *lp = [[UILongPressGestureRecognizer alloc] initWithTarget:self action:@selector(lpBall:)];
        [_ball addGestureRecognizer:lp];

        [self.rootViewController.view addSubview:_ball];
    }
    return self;
}

- (void)tapBall { if (self.onTap) self.onTap(); }

- (void)lpBall:(UILongPressGestureRecognizer *)g {
    if (g.state == UIGestureRecognizerStateBegan && self.onLongPress) self.onLongPress();
}

- (void)panBall:(UIPanGestureRecognizer *)g {
    if (g.state == UIGestureRecognizerStateChanged || g.state == UIGestureRecognizerStateEnded) {
        CGPoint t = [g translationInView:self];
        self.ball.center = CGPointMake(self.ball.center.x + t.x, self.ball.center.y + t.y);
        [g setTranslation:CGPointZero inView:self];
    }
}

- (void)attach {
    if (@available(iOS 13.0, *)) {
        for (UIScene *sc in [UIApplication sharedApplication].connectedScenes) {
            if ([sc isKindOfClass:[UIWindowScene class]] &&
                sc.activationState == UISceneActivationStateForegroundActive) {
                self.windowScene = (UIWindowScene *)sc;
                break;
            }
        }
    }
    self.frame = [UIScreen mainScreen].bounds;
    self.hidden = NO;
}

- (UIView *)hitTest:(CGPoint)point withEvent:(UIEvent *)event {
    UIView *v = [super hitTest:point withEvent:event];
    return (v == self.ball) ? v : nil;
}

@end

/* ============================================================
 *  主控制器
 * ============================================================ */
@interface JJController ()
@property (nonatomic, assign) JJCtrlState state;
@property (nonatomic, strong) NSTimer *timer;
@property (nonatomic, strong) JJBallWindow *ballWindow;
@property (nonatomic, assign) BOOL hudVisible;
@property (nonatomic, assign) BOOL learnedBoard;
@property (nonatomic, assign) BOOL busy;
@property (nonatomic, assign) NSInteger tickCount;
@property (nonatomic, strong) NSArray<NSArray<NSNumber *> *> *gridPtsCache;
@end

@implementation JJController

+ (instancetype)shared {
    static JJController *s = nil;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ s = [[JJController alloc] init]; });
    return s;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _state = JJCtrlStateIdle;
        _hudVisible = YES;
        _learnedBoard = NO;
        _busy = NO;
        _tickCount = 0;
    }
    return self;
}

- (void)start {
    NSLog(@"[JJCheat] 启动");
    [[JJScreenGrabber shared] start];
    [[JJEngineBridge shared] loadEngine];

    [[JJHUDWindow shared] attach];
    self.hudVisible = YES;

    [self setupBall];

    // 加载已保存的标定
    NSArray *saved = [[NSUserDefaults standardUserDefaults] arrayForKey:JJ_KEY_CORNERS];
    if (saved.count == 4) {
        NSMutableArray *corners = [NSMutableArray array];
        for (NSArray *p in saved) {
            [corners addObject:@[[NSNumber numberWithDouble:[p[0] doubleValue]],
                                 [NSNumber numberWithDouble:[p[1] doubleValue]]]];
        }
        [[JJEngineBridge shared] setCorners:corners];
        self.state = JJCtrlStateWaitingBoard;
        self.gridPtsCache = [[JJEngineBridge shared] gridPoints];
        [[JJHUDWindow shared] showStatus:@"已就绪 · 进入一局新棋后自动开始"];
        [self startTimer];
    } else {
        [self recalibrate];
    }
}

- (void)stop {
    [self.timer invalidate];
    self.timer = nil;
    self.state = JJCtrlStateIdle;
    [[JJScreenGrabber shared] stop];
}

- (void)setupBall {
    if (self.ballWindow) return;
    self.ballWindow = [[JJBallWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];
    __weak typeof(self) weakSelf = self;
    self.ballWindow.onTap = ^{
        __strong typeof(weakSelf) self2 = weakSelf;
        self2.hudVisible = !self2.hudVisible;
        [[JJHUDWindow shared] setHUDHidden:!self2.hudVisible];
    };
    self.ballWindow.onLongPress = ^{
        __strong typeof(weakSelf) self2 = weakSelf;
        [self2 recalibrate];
    };
    [self.ballWindow attach];
}

- (void)recalibrate {
    [self.timer invalidate];
    self.timer = nil;
    self.learnedBoard = NO;
    self.state = JJCtrlStateCalibrating;

    __weak typeof(self) weakSelf = self;
    [[JJHUDWindow shared] beginCalibrationWithCompletion:^(NSArray<NSValue *> *corners) {
        __strong typeof(weakSelf) self2 = weakSelf;
        [self2 handleCalibration:corners];
    }];
}

- (void)handleCalibration:(NSArray<NSValue *> *)corners {
    if (corners.count != 4) return;

    // point -> pixel
    CGRect nb = [UIScreen mainScreen].nativeBounds;
    CGRect pt = [UIScreen mainScreen].bounds;
    CGFloat sx = (pt.size.width > 0) ? nb.size.width / pt.size.width : 1.0;
    CGFloat sy = (pt.size.height > 0) ? nb.size.height / pt.size.height : 1.0;

    NSMutableArray *pxCorners = [NSMutableArray array];
    NSMutableArray *saved = [NSMutableArray array];
    for (NSValue *v in corners) {
        CGPoint p = [v CGPointValue];
        [pxCorners addObject:@[@(p.x * sx), @(p.y * sy)]];
        [saved addObject:@[@(p.x), @(p.y)]];
    }
    [[NSUserDefaults standardUserDefaults] setObject:saved forKey:JJ_KEY_CORNERS];
    [[NSUserDefaults standardUserDefaults] setBool:YES forKey:JJ_KEY_CALIBRATED];
    [[NSUserDefaults standardUserDefaults] synchronize];

    [[JJEngineBridge shared] setCorners:pxCorners];
    [[JJEngineBridge shared] resetWithFen:nil];
    self.gridPtsCache = [[JJEngineBridge shared] gridPoints];

    self.state = JJCtrlStateWaitingBoard;
    [self startTimer];
    [[JJHUDWindow shared] showStatus:@"标定完成 · 请进入一局新棋（开局布局）"];
    NSLog(@"[JJCheat] 标定完成 %@", pxCorners);
}

- (void)resetToStartPosition {
    self.learnedBoard = NO;
    [[JJEngineBridge shared] resetWithFen:nil];
    self.state = JJCtrlStateWaitingBoard;
    [[JJHUDWindow shared] showStatus:@"已重置 · 等开局画面"];
}

- (void)startTimer {
    [self.timer invalidate];
    NSTimeInterval interval = 1.0 / MAX(1, JJ_SCAN_FPS);
    self.timer = [NSTimer timerWithTimeInterval:interval target:self selector:@selector(tick) userInfo:nil repeats:YES];
    [[NSRunLoop mainRunLoop] addTimer:self.timer forMode:NSRunLoopCommonModes];
    [self.timer setFireDate:[NSDate date]];
}

- (void)tick {
    if (self.busy) return;
    if (self.state != JJCtrlStateWaitingBoard && self.state != JJCtrlStateRunning) return;

    int w = 0, h = 0;
    NSData *rgba = [[JJScreenGrabber shared] grabRGBAWithWidth:&w height:&h];
    if (!rgba || w <= 0 || h <= 0) return;

    self.busy = YES;
    self.tickCount++;

    // 学习阶段需要带 patch 采样
    if (!self.learnedBoard) {
        NSDictionary *info = [[JJEngineBridge shared] learnBoardWithPixels:rgba width:w height:h];
        if (info && [info[@"templateCount"] integerValue] > 0) {
            self.learnedBoard = YES;
            self.state = JJCtrlStateRunning;
            NSLog(@"[JJCheat] 棋盘学习完成 %@", info);
        }
        self.busy = NO;
        if (!self.learnedBoard) {
            [[JJHUDWindow shared] showStatus:@"正在学习棋盘…请停留在开局画面"];
        }
        return;
    }

    __weak typeof(self) weakSelf = self;
    [[JJEngineBridge shared] processPixels:rgba width:w height:h timeMs:JJ_TIME_MS
                                  callback:^(NSDictionary *result, NSError *error) {
        __strong typeof(weakSelf) self2 = weakSelf;
        if (!self2) return;
        self2.busy = NO;
        if (!result) return;

        if (self2.gridPtsCache.count != 90) {
            self2.gridPtsCache = [[JJEngineBridge shared] gridPoints];
        }

        BOOL fail = [result[@"detectFail"] boolValue];
        if (fail) {
            NSNumber *d = result[@"detectDiff"];
            [[JJHUDWindow shared] showStatus:[NSString stringWithFormat:@"识别偏差 %@ 格 · 长按球重新标定", d ?: @(0)]];
            return;
        }

        [[JJHUDWindow shared] showResult:result gridPoints:self2.gridPtsCache fen:result[@"fen"] ?: @""];

        if ([result[@"moveDetected"] boolValue]) {
            NSLog(@"[JJCheat] 检测到走法 %@ %@ → FEN %@",
                  result[@"move"], result[@"moveChinese"], result[@"fen"]);
        }
    }];
}

@end
