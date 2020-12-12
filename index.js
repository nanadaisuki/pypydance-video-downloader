process.on('unhandledRejection', function (reason, promise) {
    console.log(new Date(), 'unhandledRejection', {reason, promise});
    process.exit();
});

const fs = require('fs');
const child_process = require('child_process');

function exec(command) {
    return new Promise((resolve, reject) => {
        child_process.exec(command, (err, stdout, stderr) => {
            if (err !== null) {
                reject(err);
                return;
            }

            resolve({
                stdout: stdout.toString(),
                stderr: stderr.toString()
            });
        });
    });
}

function spawn(command, ...args) {
    return new Promise((resolve, reject) => {
        child_process
            .spawn(command, args, {
                stdio: 'inherit'
            })
            .on('error', (err) => {
                reject(err);
            })
            .on('exit', (code) => {
                resolve(code);
            });
    });
}

function isFileExists(filePath) {
    return new Promise((resolve, reject) => {
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err === null) {
                resolve(true);
            } else if (err.code === 'ENOENT') {
                resolve(false);
            } else {
                reject(err);
            }
        });
    });
}

function choiceFormat(formats) {
    const MP4_360P_30F = /^18\s+mp4/m;
    const MP4_720P_30F = /^22\s+mp4/m;
    const MP4_DASH_480P_30F = /^135\s+mp4/m;
    const MP4_DASH_720P_30F = /^136\s+mp4/m;
    const MP4_DASH_1080P_30F = /^137\s+mp4/m;
    const M4A_DASH_128K = /^140\s+m4a/m;
    const MP4_DASH_720P_60F = /^298\s+mp4/m;

    if (MP4_720P_30F.test(formats) === true) {
        console.log('download 720p 30f');
        return '22';
    }

    if (M4A_DASH_128K.test(formats) === true) {
        if (MP4_DASH_720P_30F.test(formats) === true) {
            console.log('download 720p 30f (DASH)');
            return '136+140';
        }
        if (MP4_DASH_720P_60F.test(formats) === true) {
            console.log('download 720p 60f (DASH)');
            return '298+140';
        }
        if (MP4_DASH_1080P_30F.test(formats) === true) {
            console.log('download 1080p 30f (DASH)');
            return '137+140';
        }
        if (MP4_DASH_480P_30F.test(formats) === true) {
            console.log('download 480p 30f (DASH)');
            return '135+140';
        }
    }

    if (MP4_360P_30F.test(formats) === true) {
        console.log('download 360p 30f');
        return '18';
    }

    return null;
}

async function downloadVideo(downloadPathName, url) {
    console.log(`downloadVideo: ${url}`);

    if (url === 'N/A') {
        return;
    }

    var {searchParams} = new URL(url);
    var videoId = searchParams.get('v');
    if (videoId === null) {
        throw new Error('unable extract video id');
    }

    var savePath = `download/${downloadPathName}/${videoId}.mp4`;
    if ((await isFileExists(savePath)) === true) {
        return;
    }

    var {stdout} = await exec(`youtube-dl -F "${url}"`);
    console.log(stdout);

    var format = choiceFormat(stdout);
    if (format === null) {
        throw new Error('no available format');
    }

    var tempPath = `download/${videoId}.mp4`;
    if ((await isFileExists(tempPath)) === true) {
        await fs.promises.unlink(tempPath);
    }

    var ytdl = await spawn('youtube-dl', '-f', format, '-o', tempPath, url);
    console.log(`youtube-dl: ${ytdl}`);

    if (ytdl !== 0) {
        throw new Error('youtube-dl');
    }

    var ffmpeg = await spawn(
        'ffmpeg',
        '-i',
        tempPath,
        '-c',
        'copy',
        '-movflags',
        'faststart',
        savePath
    );
    console.log(`ffmpeg: ${ffmpeg}`);

    if (ffmpeg !== 0) {
        if ((await isFileExists(savePath)) === true) {
            await fs.promises.unlink(savePath);
        }

        throw new Error('ffmpeg');
    }

    await fs.promises.unlink(tempPath);
}

async function downloadList(downloadPathName, videoUrls) {
    for (var i = 0; i < videoUrls.length; ++i) {
        var videoUrl = videoUrls[i];

        // youtube video id
        if (videoUrl.startsWith('http') === false && videoUrl.length === 11) {
            videoUrl = 'https://www.youtube.com/watch?v=' + videoUrl;
        }

        console.log(`[${i}/${videoUrls.length}] videoUrl=${videoUrl}`);
        for (var j = 0; j < 3; ++j) {
            try {
                await downloadVideo(downloadPathName, videoUrl);
                break;
            } catch (err) {
                console.log(err);
            }
        }
    }
}

function downloadFromRegex101Json(downloadPathName, json) {
    // var regex = /title="(.+?)" href="(\/watch\?v=.+?)"/;
    var videoUrls = [];
    for (var [{content: title}, {content: href}] of json) {
        videoUrls.push('https://www.youtube.com' + href);
    }
    downloadList(downloadPathName, videoUrls);
}

(function bootstrap() {
    // downloadFromRegex101Json('marshall', require('./playlist-marshall.json'));
    // downloadFromRegex101Json('mylee', require('./playlist-mylee.json'));
    downloadFromRegex101Json('tml', require('./playlist-tml.json'));
})();
