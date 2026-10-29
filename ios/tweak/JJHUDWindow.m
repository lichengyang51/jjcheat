//
//  JJHUDWindow.m
//  JJCheat
//

#import "JJHUDWindow.h"
#import "JJConfig.h"

/* ============================================================
 *  绘制视图
 * ============================================================ */
@interface JJHUDView : UIView
@property (nonatomic, assign) NSInteger fromSq;      // -1 = 无
@property (nonatomic, assign) NSInteger toSq;
@property (nonatomic, strong) NSArray<NSArray<NSNumber *> *> *gridPts; // 屏幕像素
@property (nonatomic, strong) NSArray<NSValue *> *calibPoints;         // point
@property (nonatomic, assign) JJHUDMode mode;
@property (nonatomic, copy) NSString *statusText;
@end

@implementation JJHUDView

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        self.backgroundColor = [UIColor clearColor];
        self.opaque = NO;
        self.userInteractionEnabled = NO;
        _fromSq = -1;
        _toSq = -1;
        _calibPoints = @[];
    }
    return self;
}

- (void)setMode:(JJHUDMode)mode {
    _mode = mode;
    self.userInteractionEnabled = (mode == JJHUDModeCalibrate);
    [self setNeedsDisplay];
}

/* 屏幕像素 -> 视图 point */
- (CGPoint)pointFromPixel:(CGPoint)px {
    CGSize pb = self.bounds.size;
    CGSize pix = [UIScreen mainScreen].nativeBounds.size;
    if (pix.width <= 0 || pix.height <= 0) return px;
    return CGPointMake(px.x * pb.width / pix.width, px.y * pb.height / pix.height);
}

- (void)drawArrowInContext:(CGContextRef)ctx from:(CGPoint)a to:(CGPoint)b {
    CGFloat dx = b.x - a.x, dy = b.y - a.y;
    CGFloat len = hypot(dx, dy);
    if (len < 4) return;
    CGFloat ang = atan2(dy, dx);
    CGFloat head = MIN(30.0, MAX(16.0, len * 0.30));

    CGContextSaveGState(ctx);
    CGContextSetLineCap(ctx, kCGLineCapRound);
    CGContextSetLineJoin(ctx, kCGLineJoinRound);

    // 外发光
    CGContextSetStrokeColorWithColor(ctx, [[UIColor blackColor] colorWithAlphaComponent:0.35].CGColor);
    CGContextSetLineWidth(ctx, JJ_ARROW_WIDTH + 5.0);
    CGContextMoveToPoint(ctx, a.x, a.y);
    CGContextAddLineToPoint(ctx, b.x - cosf(ang) * head * 0.85, b.y - sinf(ang) * head * 0.85);
    CGContextStrokePath(ctx);

    // 主线
    CGContextSetStrokeColorWithColor(ctx, JJ_COLOR_ARROW.CGColor);
    CGContextSetLineWidth(ctx, JJ_ARROW_WIDTH);
    CGContextMoveToPoint(ctx, a.x, a.y);
    CGContextAddLineToPoint(ctx, b.x - cosf(ang) * head * 0.85, b.y - sinf(ang) * head * 0.85);
    CGContextStrokePath(ctx);

    // 箭头三角
    CGPoint p2 = CGPointMake(b.x - cosf(ang - 0.42f) * head, b.y - sinf(ang - 0.42f) * head);
    CGPoint p3 = CGPointMake(b.x - cosf(ang + 0.42f) * head, b.y - sinf(ang + 0.42f) * head);
    CGContextSetFillColorWithColor(ctx, JJ_COLOR_ARROW_HEAD.CGColor);
    CGContextMoveToPoint(ctx, b.x, b.y);
    CGContextAddLineToPoint(ctx, p2.x, p2.y);
    CGContextAddLineToPoint(ctx, p3.x, p3.y);
    CGContextClosePath(ctx);
    CGContextFillPath(ctx);

    CGContextRestoreGState(ctx);
}

- (void)drawRingAt:(CGPoint)p radius:(CGFloat)r color:(UIColor *)color {
    CGContextRef ctx = UIGraphicsGetCurrentContext();
    CGContextSetStrokeColorWithColor(ctx, color.CGColor);
    CGContextSetLineWidth(ctx, 3.0);
    CGContextStrokeEllipseInRect(ctx, CGRectMake(p.x - r, p.y - r, r * 2, r * 2));
    CGContextSetFillColorWithColor(ctx, [color colorWithAlphaComponent:0.18].CGColor);
    CGContextFillEllipseInRect(ctx, CGRectMake(p.x - r, p.y - r, r * 2, r * 2));
}

- (void)drawRect:(CGRect)rect {
    CGContextRef ctx = UIGraphicsGetCurrentContext();

    // ---- 标定模式 ----
    if (self.mode == JJHUDModeCalibrate) {
        CGContextSetFillColorWithColor(ctx, [[UIColor blackColor] colorWithAlphaComponent:0.45].CGColor);
        CGContextFillRect(ctx, self.bounds);

        // 已点的角
        NSArray *names = @[@"左上", @"右上", @"右下", @"左下"];
        for (NSUInteger i = 0; i < self.calibPoints.count; i++) {
            CGPoint p = [self.calibPoints[i] CGPointValue];
            [[UIColor colorWithRed:0.1 green:1.0 blue:0.5 alpha:1.0] set];
            CGContextFillEllipseInRect(ctx, CGRectMake(p.x - 12, p.y - 12, 24, 24));
            NSString *t = names[i];
            [t drawAtPoint:CGPointMake(p.x + 16, p.y - 10)
                withAttributes:@{ NSFontAttributeName: [UIFont boldSystemFontOfSize:15],
                                  NSForegroundColorAttributeName: [UIColor colorWithRed:0.1 green:1.0 blue:0.5 alpha:1.0] }];
        }
        // 已点≥2 画连线
        if (self.calibPoints.count >= 2) {
            CGContextSetStrokeColorWithColor(ctx, [UIColor colorWithRed:0.1 green:1.0 blue:0.5 alpha:0.8].CGColor);
            CGContextSetLineWidth(ctx, 2);
            CGPoint a = [self.calibPoints[0] CGPointValue];
            CGPoint b = [self.calibPoints[1] CGPointValue];
            CGContextMoveToPoint(ctx, a.x, a.y);
            CGContextAddLineToPoint(ctx, b.x, b.y);
            CGContextStrokePath(ctx);
        }
        // 提示
        NSUInteger step = self.calibPoints.count;
        NSString *tip = step < 4
            ? [NSString stringWithFormat:@"点第 %lu 个角：%@（棋盘最外圈的交叉点）",
                                         (unsigned long)(step + 1), names[step]]
            : @"标定完成";
        NSDictionary *attr = @{ NSFontAttributeName: [UIFont boldSystemFontOfSize:17],
                                NSForegroundColorAttributeName: [UIColor whiteColor] };
        CGSize sz = [tip sizeWithAttributes:attr];
        CGRect box = CGRectMake((self.bounds.size.width - sz.width) / 2 - 14, 90,
                                sz.width + 28, sz.height + 20);
        [[UIColor colorWithRed:0 green:0 blue:0 alpha:0.75] set];
        UIBezierPath *bp = [UIBezierPath bezierPathWithRoundedRect:box cornerRadius:10];
        [bp fill];
        [tip drawAtPoint:CGPointMake(box.origin.x + 14, box.origin.y + 10) withAttributes:attr];
        return;
    }

    // ---- 正常显示模式 ----
    if (self.gridPts.count == 90) {
        // 连接 90 个交叉点画一遍棋盘格，让用户确认标定没错
        CGContextSetStrokeColorWithColor(ctx, JJ_COLOR_BOARD_LINE.CGColor);
        CGContextSetLineWidth(ctx, 1.0);
        for (int r = 0; r < 10; r++) {
            CGPoint prev = [self pointFromPixel:CGPointMake([self.gridPts[r * 9][0] doubleValue],
                                                           [self.gridPts[r * 9][1] doubleValue])];
            for (int c = 1; c < 9; c++) {
                CGPoint cur = [self pointFromPixel:CGPointMake([self.gridPts[r * 9 + c][0] doubleValue],
                                                              [self.gridPts[r * 9 + c][1] doubleValue])];
                CGContextMoveToPoint(ctx, prev.x, prev.y);
                CGContextAddLineToPoint(ctx, cur.x, cur.y);
                prev = cur;
            }
        }
        for (int c = 0; c < 9; c++) {
            CGPoint prev = [self pointFromPixel:CGPointMake([self.gridPts[c][0] doubleValue],
                                                           [self.gridPts[c][1] doubleValue])];
            for (int r = 1; r < 10; r++) {
                CGPoint cur = [self pointFromPixel:CGPointMake([self.gridPts[r * 9 + c][0] doubleValue],
                                                              [self.gridPts[r * 9 + c][1] doubleValue])];
                CGContextMoveToPoint(ctx, prev.x, prev.y);
                CGContextAddLineToPoint(ctx, cur.x, cur.y);
                prev = cur;
            }
        }
        CGContextStrokePath(ctx);
    }

    // 建议走法
    if (self.gridPts.count == 90 && self.fromSq >= 0 && self.toSq >= 0 &&
        self.fromSq < 90 && self.toSq < 90) {
        CGPoint a = [self pointFromPixel:CGPointMake([self.gridPts[self.fromSq][0] doubleValue],
                                                     [self.gridPts[self.fromSq][1] doubleValue])];
        CGPoint b = [self pointFromPixel:CGPointMake([self.gridPts[self.toSq][0] doubleValue],
                                                     [self.gridPts[self.toSq][1] doubleValue])];
        [self drawRingAt:a radius:20 color:JJ_COLOR_ARROW];
        [self drawRingAt:b radius:20 color:JJ_COLOR_ARROW_HEAD];
        [self drawArrowInContext:ctx from:a to:b];
    }
}

@end

/* ============================================================
 *  窗口
 * ============================================================ */
@interface JJHUDWindow () <UIGestureRecognizerDelegate>
@property (nonatomic, strong) JJHUDView *hudView;
@property (nonatomic, strong) UIView *topPanel;
@property (nonatomic, strong) UILabel *lineMain;
@property (nonatomic, strong) UILabel *lineSub;
@property (nonatomic, copy) void (^calibBlock)(NSArray<NSValue *> *);
@property (nonatomic, strong) NSMutableArray<NSValue *> *calibPoints;
@end

@implementation JJHUDWindow

+ (instancetype)shared {
    static JJHUDWindow *s = nil;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        s = [[JJHUDWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];
    });
    return s;
}

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        self.windowLevel = UIWindowLevelAlert + 1000.0;
        self.backgroundColor = [UIColor clearColor];
        self.opaque = NO;
        self.rootViewController = [[UIViewController alloc] init];
        self.rootViewController.view.backgroundColor = [UIColor clearColor];

        _hudView = [[JJHUDView alloc] initWithFrame:self.bounds];
        _hudView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
        [self.rootViewController.view addSubview:_hudView];

        // 顶部信息面板
        _topPanel = [[UIView alloc] initWithFrame:CGRectMake(8, 8, self.bounds.size.width - 16, JJ_HUD_TOP_HEIGHT)];
        _topPanel.backgroundColor = JJ_COLOR_PANEL_BG;
        _topPanel.layer.cornerRadius = 10;
        _topPanel.layer.masksToBounds = YES;
        _topPanel.userInteractionEnabled = NO;
        [self.rootViewController.view addSubview:_topPanel];

        _lineMain = [[UILabel alloc] initWithFrame:CGRectMake(12, 6, _topPanel.bounds.size.width - 24, 24)];
        _lineMain.font = [UIFont boldSystemFontOfSize:19];
        _lineMain.textColor = JJ_COLOR_TEXT_MAIN;
        [_topPanel addSubview:_lineMain];

        _lineSub = [[UILabel alloc] initWithFrame:CGRectMake(12, 28, _topPanel.bounds.size.width - 24, 18)];
        _lineSub.font = [UIFont monospacedDigitSystemFontOfSize:13 weight:UIFontWeightMedium];
        _lineSub.textColor = JJ_COLOR_TEXT_SUB;
        [_topPanel addSubview:_lineSub];

        _topPanel.hidden = YES;
        _calibPoints = [NSMutableArray array];
    }
    return self;
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
    // 只用 hidden=NO 显示，不调 makeKeyAndVisible ——
    // 抢 key window 会把 JJ象棋 的触摸吃掉。
    self.hidden = NO;
}

- (void)setMode:(JJHUDMode)mode {
    _mode = mode;
    self.hudView.mode = mode;
    if (mode == JJHUDModeCalibrate) {
        self.hudView.calibPoints = @[];
        [self.calibPoints removeAllObjects];
        self.topPanel.hidden = YES;
    }
    [self.hudView setNeedsDisplay];
}

- (void)showResult:(NSDictionary *)result
        gridPoints:(NSArray<NSArray<NSNumber *> *> *)points
               fen:(NSString *)fen {
    if (self.mode != JJHUDModeDisplay) return;

    self.hudView.gridPts = points;

    NSNumber *from = result[@"from"];
    NSNumber *to = result[@"to"];
    BOOL hasMove = (from && to && from.integerValue >= 0 && to.integerValue >= 0);
    self.hudView.fromSq = hasMove ? from.integerValue : -1;
    self.hudView.toSq = hasMove ? to.integerValue : -1;

    NSString *cn = result[@"suggestChinese"] ?: @"";
    NSString *scoreText = result[@"scoreText"] ?: @"+0.00";
    NSNumber *winrate = result[@"winrate"] ?: @(50);
    NSNumber *depth = result[@"depth"] ?: @(0);
    NSString *side = [result[@"sideToMove"] isEqual:@"red"] ? @"红方" : @"黑方";

    // 胜率条：用 emoji 方块直观显示
    int wr = winrate.intValue;
    int filled = (int)round(wr / 10.0);
    NSMutableString *bar = [NSMutableString string];
    for (int i = 0; i < 10; i++) [bar appendString:(i < filled ? @"█" : @"░")];

    NSString *mate = @"";
    NSNumber *mateN = result[@"mate"];
    if (mateN && mateN.integerValue != 0) {
        mate = [NSString stringWithFormat:@"  杀 %ld 步", (long)labs(mateN.integerValue)];
    }

    self.lineMain.text = hasMove
        ? [NSString stringWithFormat:@"%@   %@", cn, scoreText]
        : @"等待对方走子…";
    self.lineSub.text = [NSString stringWithFormat:@"%@胜率 %d%% %@  深%ld%@",
                         side, wr, bar, (long)depth.integerValue, mate];

    self.topPanel.hidden = NO;
    [self.hudView setNeedsDisplay];
}

- (void)showStatus:(NSString *)text {
    self.lineMain.text = text;
    self.lineSub.text = @"";
    self.topPanel.hidden = NO;
}

- (void)setHUDHidden:(BOOL)hidden {
    self.hidden = hidden;
}

#pragma mark - 触摸（标定）

- (void)beginCalibrationWithCompletion:(void (^)(NSArray<NSValue *> *))completion {
    self.calibBlock = completion;
    self.mode = JJHUDModeCalibrate;
    self.hidden = NO;

    UITapGestureRecognizer *tap = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(handleCalibTap:)];
    tap.delegate = self;
    [self.hudView addGestureRecognizer:tap];
}

- (void)handleCalibTap:(UITapGestureRecognizer *)g {
    if (self.mode != JJHUDModeCalibrate) return;
    CGPoint p = [g locationInView:self.hudView];
    [self.calibPoints addObject:[NSValue valueWithCGPoint:p]];
    self.hudView.calibPoints = [self.calibPoints copy];
    [self.hudView setNeedsDisplay];

    if (self.calibPoints.count >= 4) {
        self.mode = JJHUDModeDisplay;
        NSArray *result = [self.calibPoints copy];
        self.hudView.calibPoints = @[];
        if (self.calibBlock) {
            self.calibBlock(result);
            self.calibBlock = nil;
        }
    }
}

- (BOOL)gestureRecognizer:(UIGestureRecognizer *)g shouldReceiveTouch:(UITouch *)t {
    return self.mode == JJHUDModeCalibrate;
}

/** 标定模式下要吃掉触摸，显示模式完全放行 */
- (UIView *)hitTest:(CGPoint)point withEvent:(UIEvent *)event {
    if (self.mode == JJHUDModeDisplay) return nil;
    return [super hitTest:point withEvent:event];
}

@end
