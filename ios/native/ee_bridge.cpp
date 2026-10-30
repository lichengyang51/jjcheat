/*
 * ee_bridge.cpp
 * JJCheatApp —— 象眼（ElephantEye）桥接层
 *
 * 为什么换它：
 *   皮卡鱼是 NNUE 引擎，需要 48MB 网络文件，找不到就直接 exit()，
 *   在 iOS 上就是「点图标闪退」或者干脆装不起来。
 *   象眼是纯 C++ 的经典 alpha-beta 引擎：不依赖任何数据文件、体积小，
 *   静态链接也不会在启动时搞出崩溃 —— 最适合塞进手机 App。
 *
 * 它自己是个 UCCI 引擎，靠 printf 输出 "bestmove xxxx"。
 * 这里不碰它的内部结构：把 stdout 临时接到临时文件，跑一次 SearchMain，
 * 再把 "bestmove" 那一行捞出来。这样它内部怎么改都不影响我们。
 */

#include <cstdio>
#include <cstring>
#include <string>
#include <unistd.h>

#if __has_include("search.h") && __has_include("position.h")
#define EE_OK 1
#include "position.h"
#include "pregen.h"
#include "search.h"
#include "hash.h"
#else
#define EE_OK 0
#endif

#if EE_OK

// eleeye.cpp 里定义的常量（那个文件自带 main()，我们不编它），这里补一份
static const int INTERRUPT_COUNT = 4096;

extern "C" {

void ee_init(void) {
    static bool done = false;
    if (done) return;
    done = true;
    PreGenInit();
    NewHash(23);                       // 8MB 置换表，手机够用
    Search.pos.FromFen(cszStartFen);
    Search.pos.nDistance = 0;
    Search.pos.PreEvaluate();
    Search.nBanMoves = 0;
    // ★ bBatch 必须是 true ★
    //
    //   象眼的 Interrupt() 在 bBatch=false 时会去读 stdin（等 UCCI 命令），
    //   在 App 里 stdin 是 /dev/null，读下去要么阻塞要么空转，
    //   搜到一半就被判超时 → 输出 "info depth 0" + "nobestmove"（就是 rc=-2）。
    //   bBatch=true 时它只按 nMaxTimer 计时，不碰 stdin，正好适合我们这种嵌进 App 的用法。
    Search.bQuit = false;
    Search.bBatch = true;
    Search.bDebug = false;
    Search.bUseHash = true;
    Search.bUseBook = false;           // 不用它的开局库（我们有自己的）
    Search.bNullMove = true;
    Search.bKnowledge = true;
    Search.bIdle = false;
    Search.bPonder = false;
    Search.bDraw = false;
    Search.nCountMask = INTERRUPT_COUNT - 1;
    Search.nRandomMask = 0;
    Search.rc4Random.InitRand();
}

int ee_bestmove(const char *fen, int ms, char *out, int outLen) {
    if (!fen || !out || outLen < 6) return -1;
    ee_init();

    Search.pos.FromFen(fen);
    Search.pos.nDistance = 0;
    Search.pos.PreEvaluate();
    Search.bQuit = false;
    Search.nGoMode = GO_MODE_TIMER;
    Search.nProperTimer = ms;
    Search.nMaxTimer = ms;
    Search.nNodes = 0;

    // 把它 printf 出来的东西接到临时文件（里面有 info 行和 bestmove 行）
    fflush(stdout);
    int saved = dup(1);
    FILE *tmp = tmpfile();
    if (!tmp) return -4;
    dup2(fileno(tmp), 1);

    // 注意：nDepth 传 0 会被它当成「只做静态搜索」直接返回 nobestmove，
    // 必须给一个真正的深度上限，靠 nMaxTimer 到点自动停。
    SearchMain(64);   // 深度上限 64,靠 nMaxTimer 到点停

    fflush(stdout);
    dup2(saved, 1);
    close(saved);

    std::string text;
    fseek(tmp, 0, SEEK_SET);
    char buf[1024];
    size_t n;
    while ((n = fread(buf, 1, sizeof(buf), tmp)) > 0) text.append(buf, n);
    fclose(tmp);

    const size_t pos = text.rfind("bestmove");
    if (pos == std::string::npos) return -2;
    size_t p = pos + 8;
    while (p < text.size() && text[p] == ' ') p++;
    if (p + 4 > text.size()) return -2;
    std::string mv = text.substr(p, 4);
    if (mv.compare(0, 4, "nobe") == 0) return -2;

    // ★ 坐标要翻一下 ★
    //
    //   象眼的 rank 是从「红方底线」往上数的（0 = 红方底线，9 = 黑方底线），
    //   我们的 UCCI 是从「黑方底线」数的（0 = 黑方底线，跟 FEN 行号一致）。
    //   不翻就是整盘上下镜像：开局它会说 c3c4（它眼里的兵七进一），
    //   在我们这边 c3→c4 是个黑卒在走，合法性闸门直接丢弃 → 浮窗一直「正在识别」。
    //   文件名（a~i）两边一致，只需要把两个 rank 数字翻成 9 - r。
    if (mv.size() == 4 && mv[1] >= '0' && mv[1] <= '9' && mv[3] >= '0' && mv[3] <= '9') {
        mv[1] = (char) ('0' + (9 - (mv[1] - '0')));
        mv[3] = (char) ('0' + (9 - (mv[3] - '0')));
    }
    snprintf(out, outLen, "%s", mv.c_str());
    return 0;
}

}  // extern "C"

#else

extern "C" {
void ee_init(void) {}
int ee_bestmove(const char *, int, char *, int) { return -3; }
}

#endif
