#pragma once

#include "Shell.hpp"
#include <jqutil_v2/jqutil.h>
#include <memory>
#include <mutex>
#include <string>
#include <atomic>

using namespace JQUTIL_NS;

class JSShell : public JQPublishObject
{
private:
    std::unique_ptr<Shell> shell;
    std::mutex mutex;

    // PTY 状态
    int ptyMaster_ = -1;
    int ptyPid_ = -1;
    int ptyCols_ = 80;
    int ptyRows_ = 20;
    std::mutex ptyMutex_;
    void closePtyInternal();

public:
    JSShell();
    ~JSShell();

    // 原有方法
    void initialize(JQFunctionInfo& info);
    void exec(JQAsyncInfo& info);

    // PTY 终端方法（同步,非阻塞）
    void openPty(JQFunctionInfo& info);
    void writePty(JQFunctionInfo& info);
    void readPty(JQFunctionInfo& info);
    void closePty(JQFunctionInfo& info);
    void resizePty(JQFunctionInfo& info);
    void isPtyRunning(JQFunctionInfo& info);
};

JSValue createShell(JQModuleEnv* env);
