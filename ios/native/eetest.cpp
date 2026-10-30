// eetest.cpp —— CI/本地验证象眼为什么给不出着法
// 逻辑和 app 里的 ee_bridge.cpp 一样，只是多打诊断（hex dump / 局面状态）

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
    Search.bQuit = false;
    Search.bBatch = true;      // 不读 stdin，只按计时停
    Search.bDebug = false;
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

    printf("[pos] side=%d nMoveNum=%d nDistance=%d\n",
           (int) Search.pos.sdPlayer, (int) Search.pos.nMoveNum, (int) Search.pos.nDistance);
    printf("[pos] IsDraw=%d RepStatus3=%d LastCptDrw=%d\n",
           (int) Search.pos.IsDraw(), (int) Search.pos.RepStatus(3),
           (int) Search.pos.LastMove().CptDrw);

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

    SearchMain(64);   // 深度上限 64,靠 nMaxTimer 到点停

    fflush(stdout);
    dup2(saved, 1);

    std::string text;
    fseek(tmp, 0, SEEK_SET);
    char buf[1024];
    size_t n;
    while ((n = fread(buf, 1, sizeof(buf), tmp)) > 0) text.append(buf, n);
    fclose(tmp);

    printf("[raw] %zu 字节, hex:\n", text.size());
    for (size_t i = 0; i < text.size() && i < 200; i++) {
        printf("%02X ", (unsigned char) text[i]);
        if ((i + 1) % 16 == 0) printf("\n");
    }
    printf("\n[raw] 可打印版: ");
    for (size_t i = 0; i < text.size() && i < 200; i++) {
        unsigned char ch = (unsigned char) text[i];
        putchar((ch >= 32 && ch < 127) ? ch : '.');
    }
    printf("\n");

    size_t pos = std::string::npos;
    size_t at = 0;
    while ((at = text.find("bestmove", at)) != std::string::npos) {
        if (at == 0 || text[at - 1] != 'o') pos = at;
        at += 8;
    }
    if (pos == std::string::npos) { printf("[结果] 没有 bestmove → rc=-2\n"); return 2; }
    size_t p = pos + 8;
    while (p < text.size() && text[p] == ' ') p++;
    if (p + 4 > text.size()) { printf("[结果] bestmove 后面不够 4 字节\n"); return 3; }
    printf("[结果] 着法 = %.4s\n", text.c_str() + p);
    return 0;
}
