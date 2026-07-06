#include "JSShell.hpp"
#include <Exceptions/AssertFailed.hpp>
#include <cstring>
#include <cerrno>
#include <signal.h>
#include <sys/wait.h>
#include <sys/ioctl.h>
#include <termios.h>
#include <fcntl.h>
#include <unistd.h>
#include <cstdlib>

JSShell::JSShell() {}
JSShell::~JSShell() { closePtyInternal(); }

// ── 原有方法 ────────────────────────────────────────────────
void JSShell::initialize(JQFunctionInfo& info)
{
    try {
        ASSERT(info.Length() == 0);
        std::lock_guard<std::mutex> lock(mutex);
        shell = std::make_unique<Shell>();
        info.GetReturnValue().Set(true);
    } catch (const std::exception& e) {
        info.GetReturnValue().ThrowInternalError(e.what());
    }
}

void JSShell::exec(JQAsyncInfo& info)
{
    try {
        ASSERT(shell != nullptr);
        ASSERT(info.Length() == 1);
        ASSERT(info[0].is_string());

        std::string cmd = info[0].string_value();
        std::string output = shell->exec(cmd);
        info.post(output);
    } catch (const std::exception& e) {
        info.postError(e.what());
    }
}

// ── PTY 内部关闭 ─────────────────────────────────────────────
void JSShell::closePtyInternal()
{
    if (ptyPid_ > 0) {
        kill(ptyPid_, SIGHUP);
        kill(ptyPid_, SIGKILL);
        waitpid(ptyPid_, nullptr, 0);
        ptyPid_ = -1;
    }
    if (ptyMaster_ >= 0) {
        close(ptyMaster_);
        ptyMaster_ = -1;
    }
}

// ── PTY 打开 ─────────────────────────────────────────────────
void JSShell::openPty(JQFunctionInfo& info)
{
    try {
        JSContext* ctx = info.GetContext();
        std::lock_guard<std::mutex> lk(ptyMutex_);

        // 关闭旧的
        closePtyInternal();

        ptyCols_ = 80; ptyRows_ = 20;
        if (info.Length() >= 1) { int32_t v=80; JS_ToInt32(ctx, &v, info[0]); ptyCols_=v; }
        if (info.Length() >= 2) { int32_t v=20; JS_ToInt32(ctx, &v, info[1]); ptyRows_=v; }

        // 打开 PTY master
        int master = posix_openpt(O_RDWR | O_NOCTTY);
        if (master < 0) {
            info.GetReturnValue().Set(JS_NewBool(ctx, false));
            return;
        }
        if (grantpt(master) < 0 || unlockpt(master) < 0) {
            close(master);
            info.GetReturnValue().Set(JS_NewBool(ctx, false));
            return;
        }

        char slave_name[256];
        char* sn = ptsname(master);
        if (!sn) {
            close(master);
            info.GetReturnValue().Set(JS_NewBool(ctx, false));
            return;
        }
        strncpy(slave_name, sn, sizeof(slave_name)-1);
        slave_name[sizeof(slave_name)-1] = '\0';

        // 设置终端大小
        struct winsize ws;
        ws.ws_col = (unsigned short)ptyCols_;
        ws.ws_row = (unsigned short)ptyRows_;
        ws.ws_xpixel = 0; ws.ws_ypixel = 0;
        ioctl(master, TIOCSWINSZ, &ws);

        // 设置 master 非阻塞
        int flags = fcntl(master, F_GETFL, 0);
        fcntl(master, F_SETFL, flags | O_NONBLOCK);

        pid_t pid = fork();
        if (pid < 0) {
            close(master);
            info.GetReturnValue().Set(JS_NewBool(ctx, false));
            return;
        }

        if (pid == 0) {
            // 子进程：成为会话领导，绑定到 slave
            setsid();
            int slave = open(slave_name, O_RDWR | O_NOCTTY);
            if (slave < 0) _exit(1);
            ioctl(slave, TIOCSCTTY, 0);
            ioctl(slave, TIOCSWINSZ, &ws);
            dup2(slave, STDIN_FILENO);
            dup2(slave, STDOUT_FILENO);
            dup2(slave, STDERR_FILENO);
            if (slave > STDERR_FILENO) close(slave);
            close(master);

            setenv("TERM", "xterm-256color", 1);
            setenv("COLORTERM", "truecolor", 1);
            setenv("HOME", "/root", 1);
            setenv("PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", 1);
            setenv("LANG", "zh_CN.UTF-8", 1);
            setenv("PS1", "\\w \\$ ", 1);

            execlp("bash", "bash", "--norc", (char*)nullptr);
            execlp("sh", "sh", (char*)nullptr);
            _exit(1);
        }

        ptyMaster_ = master;
        ptyPid_ = pid;
        info.GetReturnValue().Set(JS_NewBool(ctx, true));
    } catch (const std::exception& e) {
        info.GetReturnValue().ThrowInternalError(e.what());
    }
}

// ── PTY 写入 ─────────────────────────────────────────────────
void JSShell::writePty(JQFunctionInfo& info)
{
    try {
        JSContext* ctx = info.GetContext();
        if (info.Length() < 1 || ptyMaster_ < 0) {
            info.GetReturnValue().Set(JS_NewBool(ctx, false));
            return;
        }
        const char* p = JS_ToCString(ctx, info[0]);
        if (!p) {
            info.GetReturnValue().Set(JS_NewBool(ctx, false));
            return;
        }
        std::string s = p;
        JS_FreeCString(ctx, p);

        // 切换为阻塞写
        int fl = fcntl(ptyMaster_, F_GETFL, 0);
        fcntl(ptyMaster_, F_SETFL, fl & ~O_NONBLOCK);

        size_t total = 0;
        while (total < s.size()) {
            ssize_t n = write(ptyMaster_, s.data() + total, s.size() - total);
            if (n < 0) {
                if (errno == EINTR) continue;
                break;
            }
            total += (size_t)n;
        }
        fcntl(ptyMaster_, F_SETFL, fl);

        info.GetReturnValue().Set(JS_NewBool(ctx, total == s.size()));
    } catch (const std::exception& e) {
        info.GetReturnValue().ThrowInternalError(e.what());
    }
}

// ── PTY 读取（非阻塞） ───────────────────────────────────────
void JSShell::readPty(JQFunctionInfo& info)
{
    try {
        JSContext* ctx = info.GetContext();
        if (ptyMaster_ < 0) {
            info.GetReturnValue().Set(JS_NewString(ctx, ""));
            return;
        }
        char buf[4096];
        ssize_t n = read(ptyMaster_, buf, sizeof(buf)-1);
        if (n > 0) {
            buf[n] = '\0';
            info.GetReturnValue().Set(JS_NewStringLen(ctx, buf, (size_t)n));
        } else {
            info.GetReturnValue().Set(JS_NewString(ctx, ""));
        }
    } catch (const std::exception& e) {
        info.GetReturnValue().ThrowInternalError(e.what());
    }
}

// ── PTY 关闭 ─────────────────────────────────────────────────
void JSShell::closePty(JQFunctionInfo& info)
{
    try {
        std::lock_guard<std::mutex> lk(ptyMutex_);
        closePtyInternal();
        info.GetReturnValue().Set(JS_UNDEFINED);
    } catch (const std::exception& e) {
        info.GetReturnValue().ThrowInternalError(e.what());
    }
}

// ── PTY 调整大小 ─────────────────────────────────────────────
void JSShell::resizePty(JQFunctionInfo& info)
{
    try {
        JSContext* ctx = info.GetContext();
        if (info.Length() < 2 || ptyMaster_ < 0) return;
        int32_t cols=80, rows=20;
        JS_ToInt32(ctx, &cols, info[0]);
        JS_ToInt32(ctx, &rows, info[1]);
        ptyCols_ = cols; ptyRows_ = rows;
        struct winsize ws;
        ws.ws_col=(unsigned short)cols; ws.ws_row=(unsigned short)rows;
        ws.ws_xpixel=0; ws.ws_ypixel=0;
        ioctl(ptyMaster_, TIOCSWINSZ, &ws);
        if (ptyPid_ > 0) kill(ptyPid_, SIGWINCH);
    } catch (const std::exception& e) {
        info.GetReturnValue().ThrowInternalError(e.what());
    }
}

// ── PTY 运行状态 ─────────────────────────────────────────────
void JSShell::isPtyRunning(JQFunctionInfo& info)
{
    try {
        JSContext* ctx = info.GetContext();
        bool running = false;
        if (ptyPid_ > 0 && ptyMaster_ >= 0) {
            int st;
            pid_t r = waitpid(ptyPid_, &st, WNOHANG);
            if (r == 0) { running = true; }
            else if (r > 0) { ptyPid_ = -1; }
        }
        info.GetReturnValue().Set(JS_NewBool(ctx, running));
    } catch (const std::exception& e) {
        info.GetReturnValue().ThrowInternalError(e.what());
    }
}

// ── 模块导出 ─────────────────────────────────────────────────
JSValue createShell(JQModuleEnv* env)
{
    JQFunctionTemplateRef tpl = JQFunctionTemplate::New(env, "Shell");
    tpl->InstanceTemplate()->setObjectCreator([]() {
        return new JSShell();
    });

    // 原有方法
    tpl->SetProtoMethod("initialize", &JSShell::initialize);
    tpl->SetProtoMethodPromise("exec", &JSShell::exec);

    // PTY 方法
    tpl->SetProtoMethod("openPty",      &JSShell::openPty);
    tpl->SetProtoMethod("writePty",     &JSShell::writePty);
    tpl->SetProtoMethod("readPty",      &JSShell::readPty);
    tpl->SetProtoMethod("closePty",     &JSShell::closePty);
    tpl->SetProtoMethod("resizePty",    &JSShell::resizePty);
    tpl->SetProtoMethod("isPtyRunning", &JSShell::isPtyRunning);

    JSShell::InitTpl(tpl);
    return tpl->CallConstructor();
}
