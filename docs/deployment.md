# Story Forge 单人低成本部署

本方案适合个人维护、内蒙古访问和答辩 Demo：一个北京区轻量服务器、一个非 root Next.js 容器、Nginx 反向代理，以及浏览器本地作品存储。应用不需要用户数据库，不需要 Supabase 才能运行。

## 上线前提

1. 大陆节点正式开站前，通过接入服务商完成非经营性 ICP 备案；域名、服务器和接入商资料保持一致。
2. 服务器建议 Ubuntu LTS、2 核 2GB 起步；如果在服务器上构建镜像，改用 2 核 4GB 或在本机/CI 构建后上传镜像。
3. 放行端口仅 `80/443`；SSH 仅密钥登录，限制来源 IP，关闭 root 密码登录。
4. 安装 Docker Engine、Docker Compose Plugin、Nginx、Certbot，并启用系统安全更新。

香港节点可以作为备案期间的临时预览环境，但正式答辩主节点优先使用大陆节点，以减少访问和备案不确定性。

## 发布目录

```text
/opt/story-forge/releases/<version>/       # 每个版本一个只读目录
/opt/story-forge/current -> releases/<version>
/opt/story-forge/.env.production            # chmod 600，永不进 Git
```

将仓库固化版本解压到新目录，复制 `.env.production.example` 为 `/opt/story-forge/.env.production`，填入服务端密钥：

```bash
cp .env.production.example /opt/story-forge/.env.production
chmod 600 /opt/story-forge/.env.production
```

不要把 `DEEPSEEK_API_KEY`、`MODELSCOPE_API_TOKEN`、Supabase service role key 放入 Dockerfile、前端变量或提交记录。首版保持 `EMBEDDING_PUBLIC_SEARCH_ENABLED=false`，不启用用户文本云端检索。

## 构建与启动

在版本目录执行：

```bash
docker compose --env-file /opt/story-forge/.env.production \
  -f deploy/docker-compose.yml up -d --build
docker compose --env-file /opt/story-forge/.env.production \
  -f deploy/docker-compose.yml ps
curl -fsS http://127.0.0.1:3000/api/health
```

健康检查只返回 `status`、`service` 和版本号，不返回 provider、模型或密钥信息。容器端口只绑定 `127.0.0.1`，公网流量必须经过 Nginx。

## Nginx 与 TLS

先将 `deploy/nginx/story-forge-bootstrap.conf` 复制到 `/etc/nginx/sites-available/story-forge.conf`，把 `server_name` 替换成真实域名并建立软链接。该配置只监听 80，用于首次签发证书。把域名 DNS 指向服务器后执行：

```bash
sudo mkdir -p /var/www/certbot
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d example.com
```

证书生成后，用 `deploy/nginx/story-forge.conf` 替换临时配置，将其中的域名和证书路径改为真实值，再执行：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

确认自动续期定时器启用，并验证续期与 Nginx reload：

```bash
sudo systemctl enable --now certbot.timer
printf '#!/bin/sh\nsystemctl reload nginx\n' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx >/dev/null
sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
sudo certbot renew --dry-run --run-deploy-hooks
```

证书稳定后保留 HSTS。Nginx 的限流是第一层保护，应用内 `AI_MAX_REQUESTS_PER_MINUTE` 和 `AI_MAX_DAILY_REQUESTS` 是第二层保护；单容器内存预算重启会清零，因此还应配置供应商余额/调用告警。

## 答辩锁定版本

答辩前单独构建并部署一份锁定版本。`NEXT_PUBLIC_DEMO_LOCKED` 会由 Compose 作为 Docker build argument 传入 Next.js 构建，不能只在容器启动时临时修改：

```bash
NEXT_PUBLIC_DEMO_LOCKED=true APP_VERSION=0.1.0-defense STORY_FORGE_ENV_FILE=/opt/story-forge/.env.production \
  docker compose --env-file /opt/story-forge/.env.production \
  -f deploy/docker-compose.yml up -d --build
```

锁定版本不调用外部 AI、生图和公开向量检索；两个内置案例只读且永久保留，用户仍可创建普通用户项目进行交互。正式答辩使用该版本，不依赖网络模型响应。

## 发布检查

发布机或本机必须先通过：

```bash
NEXT_PUBLIC_DEMO_LOCKED=false npm run verify
NEXT_PUBLIC_DEMO_LOCKED=false npm run test:e2e
NEXT_PUBLIC_DEMO_LOCKED=true npm run build
NEXT_PUBLIC_DEMO_LOCKED=true npm run test:e2e
```

Windows 本机将上述 `npm` 换为 `npm.cmd`，环境变量使用 PowerShell 的 `$env:NEXT_PUBLIC_DEMO_LOCKED='true'` 形式。两种模式都必须通过；锁定模式还要确认内置案例只读、普通用户项目可编辑。

生产启动后再检查：

```bash
curl -fsSI https://example.com/ | grep -Ei "x-content-type-options|x-frame-options|referrer-policy|permissions-policy"
curl -fsS https://example.com/api/health
```

浏览器手工确认：新建用户项目、刷新后正文不变、生成候选不自动改正文、确认采纳后才改变正文、导出 TXT/Markdown、清除本地创作数据。不要用真实用户隐私文本进行烟测。

## 回滚

每次发布保留当前版本和上一版本，不覆盖旧目录。失败时进入上一版本的源码目录，并显式选择已经存在的旧镜像标签；不要先执行 `down`：

```bash
cd /opt/story-forge/releases/0.1.0-previous
APP_VERSION=0.1.0-previous STORY_FORGE_ENV_FILE=/opt/story-forge/.env.production \
  docker compose --env-file /opt/story-forge/.env.production \
  -f deploy/docker-compose.yml up -d --no-build --pull never
curl -fsS http://127.0.0.1:3000/api/health
```

回滚后再次请求 `/api/health` 和首页，确认旧版本可用。浏览器作品在用户设备上，不随服务器回滚；应用升级不得更改 LocalStorage store 版本协议，若协议变更必须先增加迁移测试。

## 费用与数据边界

服务器、域名和 TLS 是主要固定成本；预算以购买当日云厂商价格为准，不在文档中写死促销价。AI 按月设余额上限，达到上限后应用自动使用本地结构化结果。本站不保存用户作品到数据库，但第三方 AI 是否短期保留请求取决于其服务条款；产品页面只承诺本站零数据保留。
