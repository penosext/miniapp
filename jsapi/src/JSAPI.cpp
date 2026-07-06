#include <jsmodules/JSCModuleExtension.h>
#include <jquick_config.h>
#include "ScanInput/JSScanInput.hpp"
#include "Shell/JSShell.hpp"

using namespace JQUTIL_NS;

static std::vector<std::string> exportList = {
    "ScanInput",
    "Shell"
};

static int module_init(JSContext *ctx, JSModuleDef *m)
{
    auto env = JQModuleEnv::CreateModule(ctx, m, "langningchen");

    env->setModuleExport("ScanInput", createScanInput(env.get()));
    env->setModuleExport("Shell", createShell(env.get()));

    env->setModuleExportDone(JS_UNDEFINED, exportList);
    return 0;
}

DEF_MODULE_LOAD_FUNC_EXPORT(langningchen, module_init, exportList)

extern "C" JQUICK_EXPORT void custom_init_jsapis()
{
    registerCModuleLoader("langningchen", &langningchen_module_load);
}
