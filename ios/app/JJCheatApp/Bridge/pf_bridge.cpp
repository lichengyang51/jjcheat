/*
 * pf_bridge.cpp
 * JJCheatApp —— 皮卡鱼（Pikafish）桥接层
 *
 * 皮卡鱼是 Stockfish 的中国象棋移植版（NNUE），天梯常年第一。
 * 我们把它整棵源码编成 iOS arm64 静态库，这里用它的 C++ API 直接调：
 *   Engine engine;  engine.set_position(fen);  engine.go(limits);  wait_for_search_finished();
 *   on_bestmove 回调里拿到 UCCI 着法。
 *
 * 编译时如果没有皮卡鱼源码（本地构建 / CI 那一步失败），整个文件退化成空实现，
 * 上层拿到 -3 就当没有这个引擎，照旧走 JS 引擎和云库 —— 绝不会因为引擎缺席而编不出包。
 */

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include <memory>

#if __has_include("engine.h") && __has_include("search.h")
#define PF_OK 1
#include "engine.h"
#include "search.h"
#else
#define PF_OK 0
#endif

#if PF_OK

using namespace Stockfish;

// ★ 为什么要在「所有构造函数之前」切工作目录 ★
//
//   皮卡鱼的 NNUE 网络是 namespace 级全局对象，dyld 初始化阶段就会构造它，
//   而它按相对路径 "pikafish.nnue" 去找网络文件；找不到就 std::cerr + std::exit，
//   在 iOS 上就是「点图标闪退」。
//   我们在自己的 .mm 里声明一个 constructor(101)（优先级比默认的 65535 高，
//   dyld 会先跑它），把工作目录切到 .app 目录 —— 网络文件就摆在那儿，
//   全局构造时一找就找到，启动不再崩。
//
//   这段必须放在 C++ 里（同一个编译单元），才能保证符号一定被链接进来。
#include <mach-o/dyld.h>
#include <climits>
#include <unistd.h>
#include <string>

__attribute__((constructor(101)))
static void jjcheat_chdir_to_bundle(void) {
    char exe[PATH_MAX];
    uint32_t size = sizeof(exe);
    if (_NSGetExecutablePath(exe, &size) != 0) return;
    std::string p(exe);
    const size_t pos = p.find_last_of('/');
    if (pos == std::string::npos) return;
    chdir(p.substr(0, pos).c_str());
}

static std::unique_ptr<Engine> g_eng;
static std::string g_best;

extern "C" {

void pf_init(void) {
    if (g_eng) return;
    g_eng = std::make_unique<Engine>(std::nullopt);
    g_eng->set_tt_size(32);          // 手机内存有限，32MB 置换表够用
    g_eng->set_on_bestmove([](std::string_view mv, std::string_view) {
        g_best = std::string(mv);
    });
    g_eng->search_clear();
}

void pf_clear(void) {
    if (g_eng) g_eng->search_clear();
}

/// @return 0 成功；-1 局面非法；-2 没拿到着法；-3 引擎不可用
int pf_bestmove(const char* fen, int movetimeMs, char* out, int outLen) {
    if (!g_eng) pf_init();
    if (!g_eng) return -3;
    g_best.clear();

    std::vector<std::string> moves;
    auto err = g_eng->set_position(std::string(fen), moves);
    if (err.has_value()) return -1;

    Search::LimitsType limits;
    limits.movetime = movetimeMs;
    g_eng->go(limits);
    g_eng->wait_for_search_finished();

    if (g_best.empty() || g_best == "(none)") return -2;
    std::snprintf(out, outLen, "%s", g_best.c_str());
    return 0;
}

}  // extern "C"

#else

extern "C" {

void pf_init(void) {}
void pf_clear(void) {}
int pf_bestmove(const char*, int, char*, int) { return -3; }

}  // extern "C"

#endif
