// electron-builder afterPack hook.
//
// 对打包出的 macOS .app 做 ad-hoc 签名（codesign --sign -）。
// 没有 Apple Developer 证书时，arm64 二进制必须至少带一个 ad-hoc 签名才能运行，
// 否则首次打开会报“已损坏，无法打开”。ad-hoc 签名后该报错消失；由于下载文件仍带
// com.apple.quarantine 隔离属性，首次打开仍会提示“无法验证开发者”，右键→打开即可，
// 或执行 `xattr -cr <App>` 清除隔离属性（见 README）。
//
// 该钩子只处理 darwin；Windows / Linux 直接跳过。

const { execFileSync } = require("node:child_process");
const path = require("node:path");

/** @param {import("electron-builder").AfterPackContext} context */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  console.log(`[after-pack] ad-hoc signing: ${appPath}`);

  try {
    // --force 覆盖既有签名；--deep 递归签名内部 Helper / Framework；
    // --sign - 表示 ad-hoc（无身份）签名；--timestamp=none 跳过时间戳服务器。
    execFileSync(
      "codesign",
      ["--deep", "--force", "--timestamp=none", "--sign", "-", appPath],
      { stdio: "inherit" },
    );
    // 校验签名是否成功写入（ad-hoc 下 verify 应通过，spctl 评估会失败属正常）。
    execFileSync("codesign", ["--verify", "--verbose=2", appPath], {
      stdio: "inherit",
    });
    console.log("[after-pack] ad-hoc signing done");
  } catch (err) {
    console.error("[after-pack] ad-hoc signing failed:", err.message);
    throw err;
  }
};
