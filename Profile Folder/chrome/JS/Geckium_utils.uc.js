// ==UserScript==
// @name        Geckium - Utils
// @description Utilities for making coding easier. Taken from BeautyFox.
// @author      AngelBruni
// @loadorder   1
// @include     main
// @include		about:preferences*
// @include		about:addons*
// ==/UserScript==

// Map of special characters and their corresponding HTML entities
const specialCharacters = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

// Firefox version check
const ffVersion = AppConstants.MOZ_APP_VERSION_DISPLAY;
const majorVersion = parseInt(ffVersion.split(".")[0]);
const checkedVersions = [116, 117, 120, 122, 133, 134, 135, 136, 138, 139];
const versionFlags = {};
checkedVersions.forEach(version => {
	if (majorVersion >= version) {
		const flagName = `is${version}Plus`;
		document.documentElement.setAttribute(flagName, true);
		versionFlags[flagName] = true;
	}
});

const { gkPrefUtils, gkInsertElm, gkSetAttributes } = ChromeUtils.importESModule("chrome://modules/content/GeckiumUtils.sys.mjs");
const { gkNTP } = ChromeUtils.importESModule("chrome://modules/content/GeckiumNTP.sys.mjs");
const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");

function isWindows10() {
	if (AppConstants.platform == "win") {
		if (!window.matchMedia("(-moz-platform: windows-win7)").matches && !window.matchMedia("(-moz-platform: windows-win8)").matches
		   && !window.matchMedia("(-moz-platform: windows-winvista)").matches && !window.matchMedia("(-moz-platform: windows-winxp)").matches)
			return true;
	}
	return false;
}

/**
 * lookForChangesInAttributes - Used to quickly understand which attributes change after certain conditions.
 * 
 * @elm: Element for observing.
 */
function lookForChangesInAttributes(elm) {
	if (!elm || !(elm instanceof Element)) {
        console.error("Invalid element provided.");
        return;
    }

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === "attributes")
                console.log(`'${mutation.attributeName}': '${mutation.oldValue}' -> '${elm.getAttribute(mutation.attributeName)}'`);
        });
    });

    observer.observe(elm, {
        attributes: true, 
        attributeOldValue: true 
    });

    console.log("Started observing attributes of the element.");
    return observer;
}

function getNCPatched() {
	if (AppConstants.platform == "win") {
		if (window.matchMedia("(-moz-ev-native-controls-patch)").matches	// Native Controls Patch
							|| versionFlags.is116Plus && !isWindows10())	// We are gonna assume that if the current Firefox version shouldn't be running on older Windows versions but it is, then it's a patched install.
			return "patch";
        else if (isWindows10() && window.matchMedia("(-moz-native-controls)").matches) // Marble
			return "marble";
		else if (!versionFlags.is117Plus && (window.matchMedia("(-moz-platform: windows-win7)").matches || window.matchMedia("(-moz-platform: windows-win8)").matches)) // From Firefox 115 itself running in Windows 7/8
			return "native"
    }
	return null;
}
const isNCPatched = getNCPatched();

const isBrowserWindow = window.location.href == "chrome://browser/content/browser.xhtml" && document.querySelector(`#main-window`).getAttribute("windowtype") == "navigator:browser";
const isBrowserPopUpWindow = isBrowserWindow && document.querySelector(`#main-window`).getAttribute("chromehidden").includes("menubar toolbar");

function openWindow(windowName, features) {
	window.openDialog('chrome://windows/content/'+ windowName +'/index.xhtml', '', features);
}

function updateZoomLabel() {
	const currentZoomLevel = gBrowser.ownerGlobal.gNavigatorBundle.getFormattedString("zoom-button.label", [ Math.round(gBrowser.ownerGlobal.ZoomManager.zoom * 100), ]); 

	const menuZoomElm = document.getElementById("menu_normal6");
	if (menuZoomElm)
		menuZoomElm.setAttribute('label', currentZoomLevel);
}
window.addEventListener("FullZoomChange", updateZoomLabel);
window.addEventListener("TabAttrModified", updateZoomLabel);

function bookmarksBarStatus() {
	const alwaysShowBookmarksBar = document.getElementById('menu_alwaysShowBookmarksBar5');

	if (gkPrefUtils.tryGet("browser.toolbars.bookmarks.visibility").string == 'always') {
		gkSetAttributes(alwaysShowBookmarksBar, {
			"checked": true,
			"data-visibility-enum": "newtab",
		})
	} else {
		gkSetAttributes(alwaysShowBookmarksBar, {
			"checked": false,
			"data-visibility-enum": "always",
		})
	}

	alwaysShowBookmarksBar.setAttribute("data-bookmarks-toolbar-visibility", true);

	const menuShowBookmarks = document.getElementById('menu_showBookmarks');

	if (gkPrefUtils.tryGet('browser.toolbars.bookmarks.visibility').string == 'always') {
		gkSetAttributes(menuShowBookmarks, {
			"checked": true,
			"data-visibility-enum": "newtab",
		})
	} else {
		gkSetAttributes(menuShowBookmarks, {
			"checked": false,
			"data-visibility-enum": "always",
		})
	}

	menuShowBookmarks.setAttribute("data-bookmarks-toolbar-visibility", true);
}

function updateMenuTooltipLocale() {
	const gkMenuBundle = Services.strings.createBundle("chrome://geckium/locale/properties/menu.properties");

	const menuTooltip = document.getElementById("chrome-button");
	menuTooltip.setAttribute("tooltiptext", gkMenuBundle.GetStringFromName("customizeAndControlGoogleChrome").replace("%s", gkBranding.getBrandingKey("fullName", false)));
}

function updateAboutLocale() {
	const gkMenuBundle = Services.strings.createBundle("chrome://geckium/locale/properties/menu.properties");
	
	const menuAbout = document.getElementById("menu_about");
	menuAbout.setAttribute("label", gkMenuBundle.GetStringFromName("about").replace("%s", gkBranding.getBrandingKey("fullName", false)));
}

function waitForElm(selector) {
    return new Promise(resolve => {
        if (document.querySelector(selector))
            return resolve(document.querySelector(selector));

        const observer = new MutationObserver(mutations => {
            if (document.querySelector(selector)) {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }
        });

        // If you get "parameter 1 is not of type 'Node'" error, see https://stackoverflow.com/a/77855838/492336
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
}

// Since there's no other way to get the actual DPI (`window.devicePixelRatio` only returns the pixel ratio which is not the same), we do this.
function getStandardizedDPI() {
    const { displayDPI } = window.windowUtils;
    const scalingFactor = displayDPI / 96;

    let standardizedDPI;
    if (scalingFactor < 1.25)
        standardizedDPI = 96; // 100% scaling
    else if (scalingFactor < 1.5)
        standardizedDPI = 120; // 125% scaling
    else if (scalingFactor < 1.75)
        standardizedDPI = 144; // 150% scaling
    else if (scalingFactor < 2)
        standardizedDPI = 168; // 175% scaling
	else if (scalingFactor < 2.25)
        standardizedDPI = 192; // 200% scaling
	else if (scalingFactor < 2.5)
        standardizedDPI = 216; // 225% scaling
	else if (scalingFactor < 3)
        standardizedDPI = 240; // 250% scaling
	else if (scalingFactor < 4)
        standardizedDPI = 288; // 300% scaling
	else if (scalingFactor < 5)
        standardizedDPI = 384; // 400% scaling
	else
        standardizedDPI = 480; // 500% scaling

    return standardizedDPI;
}

// Firefox 115 and later versions had different functions for fullscreen, so let's just use a generalised one
function toggleFullscreen() {
	window.fullScreen = !window.fullScreen || BrowserHandler.kiosk;
}