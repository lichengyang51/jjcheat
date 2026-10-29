TARGET := iphone:clang:16.5:14.0
ARCHS = arm64 arm64e

include $(THEOS)/makefiles/common.mk

TWEAK_NAME = JJCheat

JJCheat_FILES = Tweak.xm \
                JJController.m \
                JJEngineBridge.m \
                JJScreenGrabber.m \
                JJHUDWindow.m

JJCheat_CFLAGS = -fobjc-arc -O2 -Wno-deprecated-declarations -Wno-unused-variable
JJCheat_FRAMEWORKS = UIKit Foundation QuartzCore CoreGraphics JavaScriptCore \
                     IOSurface CoreVideo OpenGLES Metal MetalKit
JJCheat_PRIVATE_FRAMEWORKS = 

include $(THEOS_MAKE_PATH)/tweak.mk

after-install::
	install.exec "killall -9 SpringBoard || true"
