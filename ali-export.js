#! /usr/bin/env node

var fs = require("fs");
var program = require('commander');
var enumFactory = require("simple-enum");
var cheerio = require('cheerio');
var request = require('sync-request');

var csvHeaderCreated = false;

//For checking if a string is empty, null or undefined
function isEmpty(str) {
    return (!str || 0 === str.length);
}

//For checking if a string is blank, null or undefined
function isBlank(str) {
    return (!str || /^\s*$/.test(str));
}

program
    .version('0.0.2')
    .usage('[-xls]')
    .parse(process.argv);

console.log(' args: %j', program.args);

function addH(str, append_str) { //for csv header
    if (!csvHeaderCreated) {
        return add(str, append_str)
    } else {
        return "";
    }
}

function add(str, append_str) {
    if (str.length != 0) {
        str += ",";
    }
    str += append_str;
    return str;
}

function readFiles(dirname, onFileContent, onError) {
    fs.readdir(dirname, function(err, filenames) {
    if (err) {
        onError(err);
        return;
    }
    filenames.forEach(function(filename) {
        fs.readFile(dirname + filename, 'utf-8', function(err, content) {
            if (err) {
                onError(err);
                return;
            }
            onFileContent(filename, content);
        });
    });
    });
}

var csvHeader = "";
var outputFile = "aliexpress_orderlist.csv";

var columns = []; //Global var for columns
var rows = []; //Global var for rows

//Here's the main logic:
console.log("Save all [View Detail] pages to 'orders/' dir before running this script!");
var parsedFilesCount = 1;
readFiles('orders/', function(filename, content) { //use sync version
    console.log("# Parsing file("+(parsedFilesCount++)+"): orders/" + filename);
    parseHtmlFile(content);
}, function(error) {
    throw error;
});

function addNewValue(currentRow, columnTitle, columnValue, doWrap, fixURL) {
    if (doWrap == null) {doWrap = false;}
    if (fixURL == null) {fixURL = false;}
    if (columnValue == null) {columnValue = "";}
    columnValue = columnValue.trim();
    columnValue = columnValue.replace('\"','');
    columnValue = columnValue.replace(',','');
    columnValue = columnValue.replace('Best Selling','');
    columnValue = columnValue.replace('Free Shipping','');
    columnValue = columnValue.replace('Drop Shipping','');
    columnValue = columnValue.replace('Wholesale','');
    columnValue = columnValue.replace('Hot Sale','');
    columnValue = columnValue.replace('In stock','');
    console.log(columnTitle +":<" + columnValue.length + ">"+ columnValue); //Use in case of bad csv

    csvHeader = addH(csvHeader, columnTitle);
    if (doWrap) {
        columnValue = "\"" + columnValue + "\"";
    }
    if (fixURL) {
        console.log("[fixURL] Before=" + columnValue);
        columnValue = columnValue.replace('//','');
        console.log("[fixURL] Fixed columnValue= " + columnValue);
    }
    return add(currentRow, columnValue);
}

function syncGet(url) {
    var cached_page = undefined;
    if (url === undefined) {
        console.log("[ERROR] Trying syncGet url=NULL: " + url);
        return "";
    }
    console.log("syncGet url: " + url);
    var filename = 'log/' + url.replace("?", "").replace("http://www.aliexpress.com/snapshot/", "");
    try {
        fs.accessSync(filename, fs.F_OK);
        cached_page = fs.readFileSync(filename, 'utf8');
        //console.log("cached_page: " + cached_page);
        if (cached_page != undefined) {
            console.log("Found cached file: " + filename);
            return cached_page;
        }
    } catch (e) {
        // cached file isn't accessible
        var ret;
        setTimeout(function() {
            ret = request('GET', url);
        },600);
        while(ret === undefined) {
            require('deasync').runLoopOnce();
        }
        var body = ret.getBody();
        logGetBody(url, body);
        return body;
    }
    return "";
}

function getFileNameFromFullPath(url) {
    var dirtyString = url.substring(url.lastIndexOf('/')+1);
    return dirtyString.replace(/[|&;$%@"<>()?+,]/g, "");
}

function logGetBody(url, text) {
    if (url == null) {
        console.log("logGetBody ERROR, url is null! =" + url)
    }
    if (text == null) {text = "";}
    console.log("[logGetBody]>"+url+">getFileNameFromFullPath= " + getFileNameFromFullPath(url));
    var filename = "log/" + getFileNameFromFullPath(url);

    var fs = require('fs');
    fs.writeFile(filename, text, function(err) {
        if(err) {
            return console.log(err);
        }

        console.log("[logGetBody] GET request ["+url+"] was successfully saved to file: " + filename);
    });
}

function parseHtmlFile(fileContent) {
    var $=cheerio.load(fileContent);
    //Parses "View Detail" links, not snapshots!

    var row = ""; //currentRow
    var productName = $('span.desc > a:nth-child(1)').html();
    var snapshotUrl = $('.baobei-name').attr("href");
    var newName;

    if (snapshotUrl.lastIndexOf("//", 0) === 0) {snapshotUrl = "http:" + snapshotUrl;} //Fixes urls like //www.aliexpress.com/snapshot/ to http://www.aliexpress.com... form
    var page_one = syncGet(snapshotUrl);
    var $snapshot = cheerio.load(page_one);

    //img_src=$snapshot('.switch-site-tip > a:nth-child(1)').attr("href");
    console.log("# Getting ENG snapshot url:");
    var snapshotUrlEng = $snapshot('.switch-site-tip > a:nth-child(1)').attr("href");
    console.log(snapshotUrlEng);
    if (snapshotUrlEng != null) {
        snapshotUrl = snapshotUrlEng;
        console.log("# Wait 3s?");

        if (snapshotUrlEng.lastIndexOf("//", 0) === 0) {snapshotUrlEng = "http:" + snapshotUrlEng;} //Fixes urls like //www.aliexpress.com/snapshot/ to http://www.aliexpress.com... form
        var page_two = syncGet(snapshotUrlEng);
        $snapshot=cheerio.load(page_two);

        newName = $snapshot('#product-name').text();
        while(newName === undefined) {
            require('deasync').runLoopOnce();
        }
        if (newName != null) {
            console.log("# Set new name:" + newName);
            productName = newName;
        } else {
            console.log("#FATAL ERROR! newName is null! html:" + $snapshot);
        }
    } else {
        console.log("# ERROR! snapshotUrlEng is null!");
    }
    console.log();

    row = addNewValue(row, "Order Number", $('.order-no').html(), true); //TODO LOT_ID
    row = addNewValue(row, "Product Details", productName, true); //Product Details: title + snapshot link
    row = addNewValue(row, "Count", '', true); //100pcs-3w-leds <- TODO parse '100pcs' string from title and save to this field

    row = addNewValue(row, "Status", $('.order-status').text()); //bug: td.trade-status
    row = addNewValue(row, "Seller URL", $('.user-name-text > a').attr("href"), true, true);
    row = addNewValue(row, "Seller", $('.user-name-text > a').html(), true);
    row = addNewValue(row, "Price Per Unit", $('td.price').text().replace('$','').trim());
    row = addNewValue(row, "Quantity", $('td.quantity').text(), true);

    //Financial tab
    row = addNewValue(row, "Price", $('td.product-price').text().replace('US $','').trim());
    row = addNewValue(row, "Shipping Cost", $('td.shipping-price').text().replace('US $','').trim());
    row = addNewValue(row, "Adjust Price", $('td.change-price').text().replace('US $','').trim());
    row = addNewValue(row, "Discount", $('td.discount-price').text().replace('US $','').replace(/ /g, "").trim(), true);
    row = addNewValue(row, "Total Amount", $('td.order-price').text().replace('US $','').trim());
    row = addNewValue(row, "Payment Date", $('#tp-buyer-order-table > tbody:nth-child(3) > tr:nth-child(1) > td:nth-child(4)').text()); //td.pay-c4
    //Financial tab END

    row = addNewValue(row, "Shipping Method", $('#logistic-item1 > td:nth-child(1) > span:nth-child(1)').text());
    row = addNewValue(row, "Track No", $('#logistic-item1 > td:nth-child(2)').text(), true);
    row = addNewValue(row, "Snapshot", snapshotUrl, true, true);

    if (!csvHeaderCreated) {
        fs.appendFileSync(outputFile, csvHeader + "\r\n");
    }
    csvHeaderCreated = true;
    fs.appendFileSync(outputFile, row + "\r\n");
    return "formatted csv string";
}
