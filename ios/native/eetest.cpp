// eetest.cpp —— 本地验证象眼为什么给不出着法
// 逻辑和 app 里的 ee_bridge.cpp 一模一样，只是多打一些诊断信息

#include <cstdio>
#include <cstring>
#include <string>
#include <unistd.h>

#include "position.h"
#include "pregen.h"
#include "search.h"
#include "hash.h"

static const int INTERRUPT_COUNT = 4096;

int main(int argc, char **argv) {
    const char *fen = (argc > 1) ? argv[1]
        : "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";

    PreGenInit();
    NewHash(23);
    Search.pos.FromFen(cszStartFen);
    Search.pos.nDistance = 0;
    Search.pos.PreEvaluate();
    Search.nBanMoves = 0;
    Search.bQuit = Search.bBatch = Search.bDebug = false;
    Search.bUseHash = true;
    Search.bUseBook = false;
    Search.bNullMove = true;
    Search.bKnowledge = true;
    Search.bIdle = false;
    Search.bPonder = false;
    Search.bDraw = false;
    Search.nCountMask = INTERRUPT_COUNT - 1;
    Search.nRandomMask = 0;
    Search.rc4Random.InitRand();
    printf("[init] ok\n");

    Search.pos.FromFen(fen);
    Search.pos.nDistance = 0;
    Search.pos.PreEvaluate();
    printf("[pos] fromFen ok, side=%d\n", (int) Search.pos.sdPlayer);

    Search.bQuit = false;
    Search.nGoMode = GO_MODE_TIMER;
    Search.nProperTimer = 300;
    Search.nMaxTimer = 300;
    Search.nNodes = 0;

    fflush(stdout);
    int saved = dup(1);
    FILE *tmp = tmpfile();
    if (!tmp) { printf("tmpfile 失败\n"); return 1; }
    dup2(fileno(tmp), 1);

    SearchMain(0);

    fflush(stdout);
    dup2(saved, 1);

    std::string text;
    fseek(tmp, 0, SEEK_SET);
    char buf[1024];
    size_t n;
    while ((n = fread(buf, 1, sizeof(buf), tmp)) > 0) text.append(buf, n);
    fclose(tmp);

    printf("[raw] 引擎输出 %zu 字节\n", text.size());
    printf("[raw] 前 400 字节:\n%.400s\n", text.c_str());
    size_t pos = text.rfind("bestmove");
    if (pos == std::string::npos) {
        printf("[结果] 没有 bestmove → rc=-2\n");
        return 2;
    }
    printf("[结果] 找到: %s\n", text.substr(pos, 16).c_str());
    return 0;
}
