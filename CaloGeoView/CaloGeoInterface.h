#ifndef CALOGEOINTERFACE_H
#define CALOGEOINTERFACE_H

#include "TBox.h"
#include "TGFrame.h"
#include "TCanvas.h"
#include "TGeoVolume.h"
#include "TGLSAViewer.h"

// palette styles
#define GRAY   10000
#define HOT    10256
#define GREEN  10512
#define BLUE   10768
#define COPPER 11024

// detector bound styles
#define TILELARG_BOUND 0
#define     TILE_BOUND 1
#define     LARG_BOUND 2
#define  TILEHEC_BOUND 3
#define      HEC_BOUND 4
#define       NO_BOUND 5

// draw styles
#define WIREFRAME 0
#define SOLID     1
#define OUTLINE   2

// declaration of pointers for all the geometry primitives (cells)
extern TGeoVolume ****CaloLayerp;
extern TGeoVolume ****CaloLayern;

extern TCanvas *gCanvas; // the main 3D canvas declaration

// declaration of number of ADC samples to each subdetector
extern int     NSamp_til;
extern int     NSamp_hec;
extern int     NSamp_lar;

// event handler declaration ---------------------------------------------------

extern void (*cgvOnLoadFile)();
extern void (*cgvOnOnlineChange)(bool on);
extern void (*cgvOnNextByTimeChange)(bool on);
extern void (*cgvOnCurDirChange)(const char *dir);

// interface functions ---------------------------------------------------------

void         cgvInit               (TGCompositeFrame*);
void         cgvSetOnline                    (bool on);
void         cgvLoadXMLFile        (const char *fname);
bool         cgvLoadXMLFileByIndex(unsigned int index);
void         cgvLoadNextFileByTime           (bool on);
unsigned int cgvGetFileIndex                        ();
unsigned int cgvGetFileNumber                       ();
void         cgvSetNextFileTime          (Long_t time);
void         cgvSetOnlineDir         (const char *dir);
const char*  cgvGetFileName                         ();
int          cgvGetRunNumber                        ();
int          cgvGetEvNumber                         ();
const char*  cgvGetEvTime                           ();
const char*  cgvGetTriggerType                      ();
void         cgvSetTileThreshMin           (float val);
void         cgvSetTileThreshMax           (float val);
void         cgvSetUseMaxThreshTile         (bool use);
void         cgvSetMinColorValueTile       (float val);
void         cgvSetMaxColorValueTile       (float val);
void         cgvSetPaletteTile           (int palette);
void         cgvSetHECThreshMin            (float val);
void         cgvSetHECThreshMax            (float val);
void         cgvSetUseMaxThreshHEC          (bool use);
void         cgvSetMinColorValueHEC        (float val);
void         cgvSetMaxColorValueHEC        (float val);
void         cgvSetPaletteHEC            (int palette);
void         cgvSetLArgThreshMin           (float val);
void         cgvSetLArgThreshMax           (float val);
void         cgvSetUseMaxThreshLArg         (bool use);
void         cgvSetMinColorValueLArg       (float val);
void         cgvSetMaxColorValueLArg       (float val);
void         cgvSetPaletteLArg           (int palette);
void         cgvSetTileActivated      (bool activated);
void         cgvSetHECActivated       (bool activated);
void         cgvSetLArgActivated      (bool activated);
void         cgvEBshift      (float shift, bool Aside);
void         cgvEBVisible   (bool visible, bool Aside);
void         cgvSetBounds             (int ba, int eb);
void         cgvSetBoundTransparency     (char transp);
void         cgvSetBoundColor          (Pixel_t color);
void         cgvSetGraphicStyle            (int style);
void         cgvSetBckGroundColor      (Pixel_t color);
void         cgvAnimate                      (bool ok);
void         cgvSetCameraDist             (float dist);
void         cgvSetCameraSpeed           (float speed);
void         cgvSetCameraAngle           (float angle);
void         cgvBarVisible              (bool visible);
void         cgvUpdate                              ();
void         cgvSetShowTracks              (bool show);
void         cgvSetShowXMLTracks           (bool show);
void         cgvDrawTracks                          ();
void         cgvClearTracks                         ();
void         cgvSetTrackThresh          (float thresh);
void         cgvDrawPalette(TBox *box[256], int palette);

#endif
