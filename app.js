#!/usr/bin/env node

const cheerio = require("cheerio")
const path = require("path")
const fs = require("fs")
const readline = require("readline")
const { Readable } = require("stream")

const baseUrl = "https://www.spriters-resource.com"
const outDir = 'out'
process.env.NODE_NO_WARNINGS = "1"
/**
 * @typedef {Object} TAsset
 * @property {string} title 资源名
 * @property {string} path 下载地址
 * @property {string} ext 文件后缀
 */

/**
 * @typedef {Object} TPool
 * @property {string} classify 分类
 * @property {number} classifyCount 数量
 * @property {Array<TAsset>} assets 下载地址
 */

/**
 * @returns {Promise<cheerio.CheerioAPI>} 
 */
async function fetchWebPage(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://www.spriters-resource.com/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        }
    })
    const html = await res.text()
    return cheerio.load(html)
}

function parseHtml(html) {
    const $ = html
    /**
     * @type {Array<TPool>} 待下载池子
     */
    const res = []

    $(".section").each((i, el) => {
        let classify = ''
        let classifyCount = 0
        /**
         * @type {Array<TAsset>}
         */
        let assets = []
        el.childNodes.forEach((node) => {
            if (node.nodeType === 3) {
                classify = node.nodeValue.trim().replace(/\n/g, "")
            } else if (node.nodeType === 1 && $(node).hasClass("asset-count")) {
                classifyCount = +$(node).text().replace("[", "").replace("]", "")
            }
        })
        const next = el.next.next
        if (next && $(next).hasClass("icondisplay")) {
            $(next.children).each((i, el) => {
                let isZip = false
                const title = $(el).find(".iconheader").text()
                if ($(el).find(".icon-zip").hasClass("icon-zip")) {
                    isZip = true
                }
                let assetPath = ''
                let assetPathStr = $(el).find(".iconbody")._findBySelector("img").attr("src")
                if (assetPathStr) {
                    assetPath = assetPathStr.replace("asset_icons", 'assets')
                }
                const extArr = assetPath.split(".")
                let ext = extArr[extArr.length - 1].split("?")[0]
                const supportExts = ["png", "jpg", "zip"];
                if (!supportExts.includes(ext)) {
                    assetPath = assetPath.replace(ext, supportExts[0]);
                    ext = supportExts[0]
                }
                if (isZip) {
                    assetPath = assetPath.replace(ext, 'zip');
                    ext = "zip"
                }
                if (title && assetPath) {
                    assets.push({
                        title,
                        path: assetPath,
                        ext,
                    })
                }
            })
        } else {
            throw new Error("没有找到icondisplay")
        }
        res.push({
            classify,
            classifyCount,
            assets
        })
    })
    return res
}

/**
 * @param {string} baseClassify 基本分类
 * @param {string} classify 分类
 * @param {number} count 分类数量
 * @param {Array<TAsset>} assets 资源名称和下载地址
 */
async function downloadAssets(baseClassify, classify, count, assets, jumpIndex) {
    jumpIndex = +jumpIndex
    const outDirActual = path.join(__dirname, outDir, sanitizeWindowsPath(baseClassify), sanitizeWindowsPath(classify))

    if (outDir && !fs.existsSync(outDirActual)) {
        fs.mkdirSync(outDirActual, { recursive: true })
    }

    async function downloadSingle(asset, i) {
        const res = await fetch(baseUrl + asset.path, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': 'https://www.spriters-resource.com/'
            }
        })

        if (!res.ok) throw new Error(`下载失败: ${asset.path}`)

        const title = asset.title.split("?")[0]
        const filePath = path.join(outDirActual, `${sanitizeWindowsPath(title)}.${asset.ext}`)
        const writer = fs.createWriteStream(filePath)

        console.log(` 正在下载: ${asset.title} (${i + 1}/${count})`)

        return new Promise((resolve, reject) => {
            // 转换 Web Stream → Node Stream
            Readable.fromWeb(res.body).pipe(writer)

            writer.on("finish", () => {
                console.log(` 下载完成: ${filePath}`)
                resolve()
            })
            writer.on("error", reject)
        })
    }

    for (let i = jumpIndex; i < assets.length; i++) {
        const asset = assets[i];
        await downloadSingle(asset, i)
    }
}

async function run(url, jumpClassifyIndex = 0, jumpAssetIndex = 0) {
    let curJumpClassifyIndex = jumpClassifyIndex
    let curJumpAssetIndex = jumpAssetIndex
    const html = await fetchWebPage(url)

    /**
     * @type {Array<TPool>} 待下载池子
     */
    const downloadPool = parseHtml(html)
    const baseClassifyArr = url.split("/")
    const baseClassify = baseClassifyArr[baseClassifyArr.length - 1] ? baseClassifyArr[baseClassifyArr.length - 1] : baseClassifyArr[baseClassifyArr.length - 2]
    for (let i = curJumpClassifyIndex; i < downloadPool.length; i++) {
        const pool = downloadPool[i];
        const classify = pool.classify
        const count = pool.classifyCount
        console.log(`正在处理类别：${classify} , 共 ${count} 个资源 `)
        await downloadAssets(baseClassify, classify, count, pool.assets, curJumpAssetIndex)
        curJumpIndex = 0
    }
}

function prompt(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    return new Promise((resolve, reject) => {
        try {
            rl.question(question, answer => {
                rl.close()
                resolve(answer.trim())
            })
        } catch (err) {
            reject(err)
        }
    })
}

function sanitizeWindowsPath(name) {
    return name.replace(/[\\/:*?"<>|]/g, '_')
        .replace(/^[ .]+|[ .]+$/g, '');
}

async function main() {
    console.log("欢迎使用下载工具, 输入exit退出")
    while (true) {
        const params = await prompt("请输入网址:")
        if (params === 'exit') {
            break
        }
        const paramsArr = params.split(" ")
        const url = paramsArr[0]
        const debugParams = paramsArr.slice(1)
        await run(url, ...debugParams)
    }
}

main()
