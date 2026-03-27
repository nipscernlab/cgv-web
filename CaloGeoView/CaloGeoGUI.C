#include "TRint.h"
#include "TGFrame.h"
#include "TGTab.h"
#include "TGLabel.h"
#include "TGNumberEntry.h"
#include "TGButton.h"
#include "TGFileDialog.h"
#include "TSystem.h"
#include "TGComboBox.h"
#include "TGColorSelect.h"
#include "TGSlider.h"
#include "TGMenu.h"
#include "TRootEmbeddedCanvas.h"
#include "TCanvas.h"
#include <RQ_OBJECT.h>

#include "CaloGeoInterface.h"
#include "CaloInfo.h"

#include <iostream>

#define APPWIDTH  1024
#define APPHEIGHT  590

// constants -------------------------------------------------------------------

const char *filetypes[] = {"XML files", "*.xml", 0, 0};

const unsigned tableInputRows = 7;
const unsigned tableInputColumns = 2;

const unsigned tablePickRows = 6;
const unsigned tablePickColumns = 2;

// Variables -------------------------------------------------------------------

class TGUISlot
{
	private:

	void UpdateBounds();
	
	public:
	
	void OpenDirOffline();
	void FileIndex(Long_t);
	void NextFileByTime();
	void NextFileTime(Long_t);
	void OpenDirOnline();
	void OnlineStart();
	void OnlineStop();
	void TileThreshMin(Long_t);
	void TileThreshMax(Long_t);
	void UseMaxThreshTile();
	void TilePalMin(Long_t);
	void TilePalMax(Long_t);
	void PaletteTile();
	void HECThreshMin(Long_t);
	void HECThreshMax(Long_t);
	void UseMaxThreshHEC();
	void HECPalMin(Long_t);
	void HECPalMax(Long_t);
	void PaletteHEC();
	void ActiveTile();
	void ActiveHEC();
	void ActiveLArg();
	void LArgThreshMin(Long_t);
	void LArgThreshMax(Long_t);
	void UseMaxThreshLArg();
	void LArgPalMin(Long_t);
	void LArgPalMax(Long_t);
	void PaletteLArg();
	void EBAShift();
	void EBCShift();
	void ActiveEBA();
	void ActiveEBC();
	void BoundTileLArg_Event();
	void BoundTile_Event();
	void BoundLArg_Event();
	void BoundTileHEC();
	void BoundTileEB();
	void BoundHEC();
	void Transparency();
	void TranspColor();
	void WireframeStyle();
	void SolidStyle();
	void OutlineStyle();
	void Background();
	void Activated();
	void Distance();
	void CameraSpeed();
	void CameraAngle();
	void BarrelVisible();
	void PickUpdate();
	void CompTrack();
	void ShowTrack();
	void TrackThresh();	
};

TGUISlot *fGUISlot;

// Main window
TGCompositeFrame*fToolFrame;
TGCompositeFrame*fGLContainerFrame;

TGTextButton    *fTextButtonOfflineDir;
TGTextButton    *fTextButtonPick;

TGPictureButton *fPictureButtonOnlineDir;
TGPictureButton *fPictureButtonStart;
TGPictureButton *fPictureButtonStop;

TGCheckButton   *fCheckButtonNextFile;
TGCheckButton   *fCheckButtonUseMaxTile;
TGCheckButton   *fCheckButtonUseMaxHEC;
TGCheckButton   *fCheckButtonUseMaxLArg;
TGCheckButton   *fCheckButtonActiveTile;
TGCheckButton   *fCheckButtonActiveHEC;
TGCheckButton   *fCheckButtonActiveLArg;
TGCheckButton   *fCheckButtonActiveFCal;
TGCheckButton   *fCheckButtonEBAVisible;
TGCheckButton   *fCheckButtonEBCVisible;
TGCheckButton   *fCheckButtonActivated;
TGCheckButton   *fCheckButtonBarrel;
TGCheckButton   *fCheckButtonCompTrack;
TGCheckButton   *fCheckButtonShowTrack;

TGNumberEntry   *fNumberEntryFileIndex;
TGNumberEntry   *fNumberEntryNextFile;
TGNumberEntry   *fNumberEntryNewestFile;
TGNumberEntry   *fNumberEntryTileThreshMin;
TGNumberEntry   *fNumberEntryTileThreshMax;
TGNumberEntry   *fNumberEntryTilePalMin;
TGNumberEntry   *fNumberEntryTilePalMax;
TGNumberEntry   *fNumberEntryHECThreshMin;
TGNumberEntry   *fNumberEntryHECThreshMax;
TGNumberEntry   *fNumberEntryHECPalMin;
TGNumberEntry   *fNumberEntryHECPalMax;
TGNumberEntry   *fNumberEntryLArgThreshMin;
TGNumberEntry   *fNumberEntryLArgThreshMax;
TGNumberEntry   *fNumberEntryLArgPalMin;
TGNumberEntry   *fNumberEntryLArgPalMax;
TGNumberEntry   *fNumberEntryEBAShift;
TGNumberEntry   *fNumberEntryEBCShift;
TGNumberEntry   *fNumberEntryTransparency;
TGNumberEntry   *fNumberEntryDistance;
TGNumberEntry   *fNumberEntryTrackThresh;

TGLabel         *fLabelFileIndex;
TGLabel 		*fLabelMinTile;
TGLabel			*fLabelMaxTile;
TGLabel 		*fLabelMinLArg;
TGLabel			*fLabelMaxLArg;
TGLabel 		*fLabelMinHEC;
TGLabel			*fLabelMaxHEC;

TGTextEntry     *fTextEntryOnlineDir;
TGTextEntry   ***fTableCellInput;
TGTextEntry   ***fTableCellPick;

TGComboBox      *fComboBoxPalTile;
TGComboBox      *fComboBoxPalHEC;
TGComboBox      *fComboBoxPalLArg;

TGRadioButton   *fRadioButtonBoundTileLArg;
TGRadioButton   *fRadioButtonBoundTile;
TGRadioButton   *fRadioButtonBoundLArg;
TGRadioButton   *fRadioButtonBoundTileHEC;
TGRadioButton   *fRadioButtonBoundTileEB;
TGRadioButton   *fRadioButtonBoundHEC;
TGRadioButton   *fRadioButtonWireframe;
TGRadioButton   *fRadioButtonSolid;
TGRadioButton   *fRadioButtonOutline;

TGColorSelect   *fColorSelectTransparency;
TGColorSelect   *fColorSelectBackground;

TGHSlider       *fHSliderSpeed;
TGHSlider       *fHSliderAngle;

TRootEmbeddedCanvas *fCanPalT;
TRootEmbeddedCanvas *fCanPalL;
TRootEmbeddedCanvas *fCanPalH;

TBox *fBox_T[256];
TBox *fBox_L[256];
TBox *fBox_H[256];

TGHorizontalFrame *fEnergyFrameTile;
TGHorizontalFrame *fEnergyFrameLArg;
TGHorizontalFrame *fEnergyFrameHEC;
TGHorizontalFrame *fPMTFrame[2];
TGVerticalFrame   *fPickFrame;

// Auxiliar functions ----------------------------------------------------------

bool GetFile(TGFileInfo &fi)
{
	static TString dir(".");

	fi.fFileTypes = filetypes;
	fi.fIniDir    = StrDup(dir);

	new TGFileDialog(gClient->GetDefaultRoot(), fToolFrame, kFDOpen, &fi);
	if (!fi.fFilename) return false;
	dir = fi.fIniDir;

	return true;
}

// GUI functions ---------------------------------------------------------------

void FrameIndex(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel        *LabelFileIndex = new TGLabel      (Frame,     "File index");
	               fLabelFileIndex = new TGLabel      (Frame, "of 0          ");
	         fNumberEntryFileIndex = new TGNumberEntry(Frame,             0, 4);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(       LabelFileIndex, new TGLayoutHints(kLHintsLeft  | kLHintsTop, 56, 3, 2, 0));
	Frame->AddFrame(      fLabelFileIndex, new TGLayoutHints(kLHintsRight | kLHintsTop, 3, 56, 2, 0));
	Frame->AddFrame(fNumberEntryFileIndex, new TGLayoutHints(kLHintsExpandX                        ));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 5, 5, 5, 5));
}

void FrameNextFile(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	  fCheckButtonNextFile = new TGCheckButton(Frame, "Load next file in");
	TGLabel *LabelNextFile = new TGLabel      (Frame,           "seconds");
	  fNumberEntryNextFile = new TGNumberEntry(Frame,                3, 4);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCheckButtonNextFile, new TGLayoutHints(kLHintsLeft  | kLHintsTop             ));
	Frame->AddFrame(       LabelNextFile, new TGLayoutHints(kLHintsRight | kLHintsTop, 3, 70, 2, 0));
	Frame->AddFrame(fNumberEntryNextFile, new TGLayoutHints(kLHintsExpandX                        ));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 5, 5, 5, 5));
}

void FrameFileIndex(TGCompositeFrame *owner)
{
	TGVerticalFrame *Frame = new TGVerticalFrame(owner, 100 , 100, kVerticalFrame | kSunkenFrame);

	FrameIndex   (Frame);
	FrameNextFile(Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 10, 10, 10, 10));
}

void FrameOfflineDir(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fTextButtonOfflineDir = new TGTextButton(Frame, "Files in Folder...");

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fTextButtonOfflineDir, new TGLayoutHints(kLHintsRight | kLHintsTop, 0, 10, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 0, 10));
}

void FrameOfline(TGCompositeFrame *owner)
{
	TGVerticalFrame *Frame = new TGVerticalFrame(owner);

	FrameFileIndex (Frame);
	FrameOfflineDir(Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameDirLabel(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelDir = new TGLabel(Frame, "Directory");

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelDir, new TGLayoutHints(kLHintsLeft | kLHintsTop, 30, 0, 15, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameOnlineDir(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fPictureButtonOnlineDir = new TGPictureButton(Frame, gClient->GetPicture("fileopen.xpm"));
	    fTextEntryOnlineDir = new TGTextEntry(Frame, "/tmp/atlantis");
	    fTextEntryOnlineDir->SetEnabled(false);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fPictureButtonOnlineDir, new TGLayoutHints(kLHintsRight | kLHintsTop, 0, 43, 0, 0));
	Frame->AddFrame(    fTextEntryOnlineDir, new TGLayoutHints(           kLHintsExpandX,30, 14, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameNewestFile(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	 TGLabel *LabelNewest  = new       TGLabel(Frame, "Load the newest file at each");
	 TGLabel *LabelSeconds = new       TGLabel(Frame,                      "seconds");
	fNumberEntryNewestFile = new TGNumberEntry(Frame,                           5, 4);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(           LabelNewest, new TGLayoutHints(kLHintsLeft  | kLHintsTop, 30, 0, 2, 0));
	Frame->AddFrame(          LabelSeconds, new TGLayoutHints(kLHintsRight | kLHintsTop,  0,30, 2, 0));
	Frame->AddFrame(fNumberEntryNewestFile, new TGLayoutHints(           kLHintsExpandX,  3, 3, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 5, 0));
}

void FrameOnlineStartStop(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fPictureButtonStart = new TGPictureButton(Frame, gClient->GetPicture(  "ed_execute.png"));
	fPictureButtonStop  = new TGPictureButton(Frame, gClient->GetPicture("ed_interrupt.png"));
	fPictureButtonStart->SetWidth(50);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fPictureButtonStart, new TGLayoutHints(kLHintsLeft | kLHintsTop            ));
	Frame->AddFrame(fPictureButtonStop , new TGLayoutHints(kLHintsLeft | kLHintsTop, 3, 0, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 30, 0, 10, 10));
}

void FrameOnline(TGCompositeFrame *owner)
{
	TGVerticalFrame *Frame = new TGVerticalFrame(owner);

	FrameDirLabel       (Frame);
	FrameOnlineDir      (Frame);
	FrameNewestFile     (Frame);
	FrameOnlineStartStop(Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void TabInput(TGCompositeFrame *owner)
{
	TGTab *Tab = new TGTab(owner);

	// Create a TGCompsiteFrame to each tab ------------------------------------

	TGCompositeFrame *CompositeFrame1;
	TGCompositeFrame *CompositeFrame2;

	// Associate a Frame to a Tab ----------------------------------------------

	CompositeFrame1 = Tab->AddTab("Offline");
	CompositeFrame2 = Tab->AddTab("Online" );

	// Populate tab frame ------------------------------------------------------

	FrameOfline(CompositeFrame1);
	FrameOnline(CompositeFrame2);

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Tab, new TGLayoutHints(kLHintsExpandX));
}

void FrameVisTileFrom(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelFrom        = new TGLabel      (Frame, "From");
	TGLabel *LabelMeV         = new TGLabel      (Frame,  "MeV");
	fNumberEntryTileThreshMin = new TGNumberEntry(Frame, 250, 4);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelFrom                , new TGLayoutHints(kLHintsLeft  | kLHintsTop, 0, 0, 2, 0));
	Frame->AddFrame(LabelMeV                 , new TGLayoutHints(kLHintsRight | kLHintsTop, 4, 0, 2, 0));
	Frame->AddFrame(fNumberEntryTileThreshMin, new TGLayoutHints(           kLHintsExpandX, 4, 0, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 15, 0));
}

void FrameVisTileTo(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelTo          = new TGLabel      (Frame,     "to");
	TGLabel *LabelMeV         = new TGLabel      (Frame,    "MeV");
	fNumberEntryTileThreshMax = new TGNumberEntry(Frame, 10000, 4);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelTo                  , new TGLayoutHints(kLHintsLeft  | kLHintsTop,18, 0, 2, 0));
	Frame->AddFrame(LabelMeV                 , new TGLayoutHints(kLHintsRight | kLHintsTop, 4, 0, 2, 0));
	Frame->AddFrame(fNumberEntryTileThreshMax, new TGLayoutHints(           kLHintsExpandX, 4, 0, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 5, 0));
}

void FramePalTileFrom(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelFrom        = new TGLabel      (Frame, "From");
	TGLabel *LabelMeV         = new TGLabel      (Frame,  "MeV");
	fNumberEntryTilePalMin    = new TGNumberEntry(Frame,   0, 4);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelFrom             , new TGLayoutHints(kLHintsLeft  | kLHintsTop, 0, 0, 2, 0));
	Frame->AddFrame(LabelMeV              , new TGLayoutHints(kLHintsRight | kLHintsTop, 4, 0, 2, 0));
	Frame->AddFrame(fNumberEntryTilePalMin, new TGLayoutHints(           kLHintsExpandX, 4, 0, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 15, 0));
}

void FramePalTileTo(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelTo          = new TGLabel      (Frame,    "to");
	TGLabel *LabelMeV         = new TGLabel      (Frame,   "MeV");
	fNumberEntryTilePalMax    = new TGNumberEntry(Frame, 2000, 4);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelTo               , new TGLayoutHints(kLHintsLeft  | kLHintsTop,18, 0, 2, 0));
	Frame->AddFrame(LabelMeV              , new TGLayoutHints(kLHintsRight | kLHintsTop, 4, 0, 2, 0));
	Frame->AddFrame(fNumberEntryTilePalMax, new TGLayoutHints(           kLHintsExpandX, 4, 0, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 5, 0));
}

void FrameUseMaxTile(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fCheckButtonUseMaxTile = new TGCheckButton(Frame, "Use maximum thresh.");

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCheckButtonUseMaxTile, new TGLayoutHints(kLHintsLeft  | kLHintsTop));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 10, 0));
}

void FramePalPalTile(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelPalette = new TGLabel   (Frame, "Style");
	fComboBoxPalTile      = new TGComboBox(Frame,   "Hot");

	fComboBoxPalTile->AddEntry(  "Gray",0);
	fComboBoxPalTile->AddEntry(   "Hot",1);
	fComboBoxPalTile->AddEntry( "Green",2);
	fComboBoxPalTile->AddEntry(  "Blue",3);
	fComboBoxPalTile->AddEntry("Copper",4);
	fComboBoxPalTile->Select  (         1);
	fComboBoxPalTile->Resize  (    102,22);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelPalette    , new TGLayoutHints(kLHintsLeft  | kLHintsTop, 0, 0, 2, 0));
	Frame->AddFrame(fComboBoxPalTile, new TGLayoutHints(           kLHintsExpandX, 4,30, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 5, 0));
}

void GroupFrameVisTile(TGCompositeFrame *owner)
{
	TGGroupFrame *Frame = new TGGroupFrame(owner, "Visibility");

	FrameVisTileFrom(Frame);
	FrameVisTileTo  (Frame);
	FrameUseMaxTile (Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void GroupFramePalTile(TGCompositeFrame *owner)
{
	TGGroupFrame *Frame = new TGGroupFrame(owner, "Palette");

	FramePalTileFrom(Frame);
	FramePalTileTo  (Frame);
	FramePalPalTile (Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameTileCal(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	GroupFrameVisTile(Frame);
	GroupFramePalTile(Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameVisHECFrom(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelFrom        = new TGLabel      (Frame,  "From");
	TGLabel *LabelMeV         = new TGLabel      (Frame,   "MeV");
	fNumberEntryHECThreshMin  = new TGNumberEntry(Frame, 1500, 4);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelFrom               , new TGLayoutHints(kLHintsLeft  | kLHintsTop, 0, 0, 2, 0));
	Frame->AddFrame(LabelMeV                , new TGLayoutHints(kLHintsRight | kLHintsTop, 4, 0, 2, 0));
	Frame->AddFrame(fNumberEntryHECThreshMin, new TGLayoutHints(           kLHintsExpandX, 4, 0, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 15, 0));
}

void FrameVisHECTo(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelTo          = new TGLabel      (Frame,     "to");
	TGLabel *LabelMeV         = new TGLabel      (Frame,    "MeV");
	fNumberEntryHECThreshMax = new TGNumberEntry(Frame, 10000, 4);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelTo                 , new TGLayoutHints(kLHintsLeft  | kLHintsTop,18, 0, 2, 0));
	Frame->AddFrame(LabelMeV                , new TGLayoutHints(kLHintsRight | kLHintsTop, 4, 0, 2, 0));
	Frame->AddFrame(fNumberEntryHECThreshMax, new TGLayoutHints(           kLHintsExpandX, 4, 0, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 5, 0));
}

void FramePalHECFrom(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelFrom    = new TGLabel      (Frame, "From");
	TGLabel *LabelMeV     = new TGLabel      (Frame,  "MeV");
	fNumberEntryHECPalMin = new TGNumberEntry(Frame,   0, 4);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelFrom            , new TGLayoutHints(kLHintsLeft  | kLHintsTop, 0, 0, 2, 0));
	Frame->AddFrame(LabelMeV             , new TGLayoutHints(kLHintsRight | kLHintsTop, 4, 0, 2, 0));
	Frame->AddFrame(fNumberEntryHECPalMin, new TGLayoutHints(           kLHintsExpandX, 4, 0, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 15, 0));
}

void FramePalHECTo(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelTo      = new TGLabel      (Frame,    "to");
	TGLabel *LabelMeV     = new TGLabel      (Frame,   "MeV");
	fNumberEntryHECPalMax = new TGNumberEntry(Frame, 5000, 4);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelTo              , new TGLayoutHints(kLHintsLeft  | kLHintsTop,18, 0, 2, 0));
	Frame->AddFrame(LabelMeV             , new TGLayoutHints(kLHintsRight | kLHintsTop, 4, 0, 2, 0));
	Frame->AddFrame(fNumberEntryHECPalMax, new TGLayoutHints(           kLHintsExpandX, 4, 0, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 5, 0));
}

void FrameUseMaxHEC(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fCheckButtonUseMaxHEC = new TGCheckButton(Frame, "Use maximum thresh.");

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCheckButtonUseMaxHEC, new TGLayoutHints(kLHintsLeft | kLHintsTop));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 10, 0));
}

void FramePalPalHEC(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelPalette = new TGLabel   (Frame, "Style");
	fComboBoxPalHEC       = new TGComboBox(Frame,  "Blue");

	fComboBoxPalHEC->AddEntry(  "Gray",0);
	fComboBoxPalHEC->AddEntry(   "Hot",1);
	fComboBoxPalHEC->AddEntry( "Green",2);
	fComboBoxPalHEC->AddEntry(  "Blue",3);
	fComboBoxPalHEC->AddEntry("Copper",4);
	fComboBoxPalHEC->Select  (         3);
	fComboBoxPalHEC->Resize  (    102,22);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelPalette   , new TGLayoutHints(kLHintsLeft  | kLHintsTop, 0, 0, 2, 0));
	Frame->AddFrame(fComboBoxPalHEC, new TGLayoutHints(           kLHintsExpandX, 4,30, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 5, 0));
}

void FrameVisLArgFrom(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelFrom         = new TGLabel      (Frame, "From");
	TGLabel *LabelMeV          = new TGLabel      (Frame,  "MeV");
	fNumberEntryLArgThreshMin  = new TGNumberEntry(Frame, 200, 4);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelFrom                , new TGLayoutHints(kLHintsLeft  | kLHintsTop, 0, 0, 2, 0));
	Frame->AddFrame(LabelMeV                 , new TGLayoutHints(kLHintsRight | kLHintsTop, 4, 0, 2, 0));
	Frame->AddFrame(fNumberEntryLArgThreshMin, new TGLayoutHints(           kLHintsExpandX, 4, 0, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 15, 0));
}

void FrameVisLArgTo(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelTo          = new TGLabel      (Frame,     "to");
	TGLabel *LabelMeV         = new TGLabel      (Frame,    "MeV");
	fNumberEntryLArgThreshMax = new TGNumberEntry(Frame, 10000, 4);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelTo                  , new TGLayoutHints(kLHintsLeft  | kLHintsTop,18, 0, 2, 0));
	Frame->AddFrame(LabelMeV                 , new TGLayoutHints(kLHintsRight | kLHintsTop, 4, 0, 2, 0));
	Frame->AddFrame(fNumberEntryLArgThreshMax, new TGLayoutHints(           kLHintsExpandX, 4, 0, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 5, 0));
}

void FramePalLArgFrom(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelFrom     = new TGLabel      (Frame, "From");
	TGLabel *LabelMeV      = new TGLabel      (Frame,  "MeV");
	fNumberEntryLArgPalMin = new TGNumberEntry(Frame,   0, 4);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelFrom             , new TGLayoutHints(kLHintsLeft  | kLHintsTop, 0, 0, 2, 0));
	Frame->AddFrame(LabelMeV              , new TGLayoutHints(kLHintsRight | kLHintsTop, 4, 0, 2, 0));
	Frame->AddFrame(fNumberEntryLArgPalMin, new TGLayoutHints(           kLHintsExpandX, 4, 0, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 15, 0));
}

void FramePalLArgTo(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelTo       = new TGLabel      (Frame,    "to");
	TGLabel *LabelMeV      = new TGLabel      (Frame,   "MeV");
	fNumberEntryLArgPalMax = new TGNumberEntry(Frame, 1000, 4);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelTo               , new TGLayoutHints(kLHintsLeft  | kLHintsTop,18, 0, 2, 0));
	Frame->AddFrame(LabelMeV              , new TGLayoutHints(kLHintsRight | kLHintsTop, 4, 0, 2, 0));
	Frame->AddFrame(fNumberEntryLArgPalMax, new TGLayoutHints(           kLHintsExpandX, 4, 0, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 5, 0));
}

void FrameUseMaxLArg(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fCheckButtonUseMaxLArg = new TGCheckButton(Frame, "Use maximum thresh.");

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCheckButtonUseMaxLArg, new TGLayoutHints(kLHintsLeft | kLHintsTop));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 10, 0));
}

void FramePalPalLArg(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelPalette  = new TGLabel   (Frame, "Style");
	fComboBoxPalLArg       = new TGComboBox(Frame, "Green");

	fComboBoxPalLArg->AddEntry(  "Gray",0);
	fComboBoxPalLArg->AddEntry(   "Hot",1);
	fComboBoxPalLArg->AddEntry( "Green",2);
	fComboBoxPalLArg->AddEntry(  "Blue",3);
	fComboBoxPalLArg->AddEntry("Copper",4);
	fComboBoxPalLArg->Select  (         2);
	fComboBoxPalLArg->Resize  (    102,22);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelPalette    , new TGLayoutHints(kLHintsLeft  | kLHintsTop, 0, 0, 2, 0));
	Frame->AddFrame(fComboBoxPalLArg, new TGLayoutHints(           kLHintsExpandX, 4,30, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 5, 0));
}

void FrameActiveTile(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fCheckButtonActiveTile = new TGCheckButton(Frame, "TileCal");
	fCheckButtonActiveTile->SetDown(true);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCheckButtonActiveTile, new TGLayoutHints(kLHintsLeft | kLHintsTop, 10, 10, 7, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameActiveHEC(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fCheckButtonActiveHEC = new TGCheckButton(Frame, "HEC");
	fCheckButtonActiveHEC->SetDown(true);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCheckButtonActiveHEC, new TGLayoutHints(kLHintsLeft | kLHintsTop, 10, 10, 4, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}
void FrameActiveLArg(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fCheckButtonActiveLArg = new TGCheckButton(Frame, "LArg");
	fCheckButtonActiveLArg->SetDown(true);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCheckButtonActiveLArg, new TGLayoutHints(kLHintsLeft | kLHintsTop, 10, 10, 4, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}
void FrameActiveFCal(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fCheckButtonActiveFCal = new TGCheckButton(Frame, "FCal");
	fCheckButtonActiveFCal->SetEnabled(false);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCheckButtonActiveFCal, new TGLayoutHints(kLHintsLeft | kLHintsTop, 10, 10, 4, 4));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameBarrel(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fCheckButtonBarrel = new TGCheckButton(Frame, "Long Barrel");
	fCheckButtonBarrel->SetDown(true);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCheckButtonBarrel, new TGLayoutHints(kLHintsLeft | kLHintsTop));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 10, 0));
}

void FrameEBAShift(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fNumberEntryEBAShift   = new TGNumberEntry(Frame,      0, 4);
	TGLabel *LabelShift    = new TGLabel(Frame, "Shift");
	TGLabel *Labelmm       = new TGLabel(Frame, "mm");
	fCheckButtonEBAVisible = new TGCheckButton(Frame, "EBA");
	fCheckButtonEBAVisible->SetDown(true);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCheckButtonEBAVisible, new TGLayoutHints(kLHintsLeft  | kLHintsTop,  0, 0, 2, 0));
	Frame->AddFrame(LabelShift            , new TGLayoutHints(kLHintsLeft  | kLHintsTop, 20, 0, 4, 0));
	Frame->AddFrame(Labelmm               , new TGLayoutHints(kLHintsRight | kLHintsTop,  3,10, 4, 0));
	Frame->AddFrame(fNumberEntryEBAShift  , new TGLayoutHints(           kLHintsExpandX,  3, 0, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 9, 0));
}

void FrameEBCShift(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fNumberEntryEBCShift   = new TGNumberEntry(Frame,      0, 4);
	TGLabel *LabelShift    = new TGLabel(Frame, "Shift");
	TGLabel *Labelmm       = new TGLabel(Frame, "mm");
	fCheckButtonEBCVisible = new TGCheckButton(Frame, "EBC");
	fCheckButtonEBCVisible->SetDown(true);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCheckButtonEBCVisible, new TGLayoutHints(kLHintsLeft  | kLHintsTop,  0, 0, 2, 0));
	Frame->AddFrame(LabelShift            , new TGLayoutHints(kLHintsLeft  | kLHintsTop, 20, 0, 4, 0));
	Frame->AddFrame(Labelmm               , new TGLayoutHints(kLHintsRight | kLHintsTop,  3,10, 4, 0));
	Frame->AddFrame(fNumberEntryEBCShift  , new TGLayoutHints(           kLHintsExpandX,  3, 0, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 7, 4));
}

void FrameBoundTileLArg(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fRadioButtonBoundTileLArg = new TGRadioButton(Frame, "TileCal + LArg");
	fRadioButtonBoundTileLArg->SetState(kButtonDown);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fRadioButtonBoundTileLArg, new TGLayoutHints(kLHintsExpandX));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 3, 0));
}

void FrameBoundTile(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fRadioButtonBoundTile = new TGRadioButton(Frame, "TileCal only");

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fRadioButtonBoundTile, new TGLayoutHints(kLHintsExpandX));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 1, 0));
}

void FrameBoundLArg(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fRadioButtonBoundLArg = new TGRadioButton(Frame, "LArg only");

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fRadioButtonBoundLArg, new TGLayoutHints(kLHintsExpandX));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 1, 0));
}

void FrameBoundTileHEC(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fRadioButtonBoundTileHEC = new TGRadioButton(Frame, "TileCal + HEC");
	fRadioButtonBoundTileHEC->SetState(kButtonDown);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fRadioButtonBoundTileHEC, new TGLayoutHints(kLHintsExpandX));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 3, 0));
}

void FrameBoundTileEB(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fRadioButtonBoundTileEB = new TGRadioButton(Frame, "TileCal only");

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fRadioButtonBoundTileEB, new TGLayoutHints(kLHintsExpandX));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 1, 0));
}

void FrameBoundHEC(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fRadioButtonBoundHEC = new TGRadioButton(Frame, "HEC only");

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fRadioButtonBoundHEC, new TGLayoutHints(kLHintsExpandX));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 1, 0));
}

void FrameTransparency(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	ULong_t ColPar1;
	gClient->GetColorByName("#ffffff", ColPar1);

	fColorSelectTransparency = new TGColorSelect(Frame,    ColPar1, -1);
	TGLabel *LabelPercent    = new TGLabel      (Frame,            "%");
	fNumberEntryTransparency = new TGNumberEntry(Frame,          85, 6);
	TGLabel *LabelTransp     = new TGLabel      (Frame, "Transparency");

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fColorSelectTransparency, new TGLayoutHints(kLHintsRight | kLHintsTop, 3,10, 0, 0));
	Frame->AddFrame(            LabelPercent, new TGLayoutHints(kLHintsRight | kLHintsTop, 3, 3, 2, 0));
	Frame->AddFrame(fNumberEntryTransparency, new TGLayoutHints(kLHintsRight | kLHintsTop            ));
	Frame->AddFrame(             LabelTransp, new TGLayoutHints(kLHintsRight | kLHintsTop, 0, 3, 2, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 3, 0));
}

void FrameWireframe(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fRadioButtonWireframe = new TGRadioButton(Frame, "Wireframe");

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fRadioButtonWireframe, new TGLayoutHints(kLHintsExpandX));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 10, 0));
}

void FrameSolid(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fRadioButtonSolid = new TGRadioButton(Frame, "Solid");

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fRadioButtonSolid, new TGLayoutHints(kLHintsExpandX));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameOutline(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fRadioButtonOutline = new TGRadioButton(Frame, "Outline");
	fRadioButtonOutline->SetState(kButtonDown);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fRadioButtonSolid, new TGLayoutHints(kLHintsExpandX));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameBackground(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	ULong_t ColPar1;
	gClient->GetColorByName("#ffffff", ColPar1);
	fColorSelectBackground = new TGColorSelect(Frame,  ColPar1, -1);
	TGLabel *Label         = new TGLabel      (Frame, "Background");

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fColorSelectBackground, new TGLayoutHints(kLHintsRight | kLHintsTop            ));
	Frame->AddFrame(Label                 , new TGLayoutHints(kLHintsRight | kLHintsTop, 0, 0, 2, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 10, 0));
}

void FrameDistance(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *LabelDistance = new TGLabel      (Frame, "Distance");
	  fNumberEntryDistance = new TGNumberEntry(Frame,       0, 4);
	TGLabel *LabelMeter    = new TGLabel      (Frame,   "meters");

	fNumberEntryDistance->GetButtonUp  ()->SetEnabled(false);
	fNumberEntryDistance->GetButtonDown()->SetEnabled(false);
	fNumberEntryDistance->GetNumberEntry()->SetEnabled(false);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(LabelDistance       , new TGLayoutHints(kLHintsLeft  | kLHintsTop, 0, 0, 2, 0));
	Frame->AddFrame(LabelMeter          , new TGLayoutHints(kLHintsRight | kLHintsTop, 3, 0, 2, 0));
	Frame->AddFrame(fNumberEntryDistance, new TGLayoutHints(           kLHintsExpandX, 3, 0, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 5, 0));
}

void FrameSpeed(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *Label = new TGLabel  (Frame, "Speed");
	fHSliderSpeed  = new TGHSlider(Frame);
	fHSliderSpeed->SetRange(0, 100);
	fHSliderSpeed->SetPosition (20);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(Label        , new TGLayoutHints(kLHintsLeft | kLHintsTop, 0, 0, 5, 0));
	Frame->AddFrame(fHSliderSpeed, new TGLayoutHints(          kLHintsExpandX, 0,-7, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameAngle(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	TGLabel *Label = new TGLabel  (Frame, "Angle");
	fHSliderAngle  = new TGHSlider(Frame);
	fHSliderAngle->SetRange(-90, 90);
	fHSliderAngle->SetPosition   (0);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(Label        , new TGLayoutHints(kLHintsLeft | kLHintsTop, 0, 0, 5, 0));
	Frame->AddFrame(fHSliderAngle, new TGLayoutHints(          kLHintsExpandX, 3,-7, 0, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameActivated(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fCheckButtonActivated = new TGCheckButton(Frame, "Activated");

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCheckButtonActivated, new TGLayoutHints(kLHintsLeft | kLHintsTop));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX, 0, 0, 3,-3));
}

TGHorizontalFrame* TablePickLine(TGCompositeFrame *owner, int line_index, const char *cell_name)
{
	// Main frame --------------------------------------------------------------

	TGHorizontalFrame* Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fTableCellPick[line_index] = new TGTextEntry*[tablePickColumns];

	////////////////////////////////////////////////////////////////////////////
	// Peace of code to generate a flat layout (to complicated!!)
	TGFont *ufont;
	ufont = gClient->GetFont("-*-helvetica-medium-r-*-*-12-*-*-*-*-*-iso8859-1");
	TGGC *uGC;
	GCValues_t valEntry;
	valEntry.fMask = kGCForeground | kGCBackground | kGCFillStyle | kGCFont | kGCGraphicsExposures;
	gClient->GetColorByName("#000000",valEntry.fForeground);
	gClient->GetColorByName("#c0c0c0",valEntry.fBackground);
	valEntry.fFillStyle = kFillSolid;
	valEntry.fFont = ufont->GetFontHandle();
	valEntry.fGraphicsExposures = kFALSE;
	uGC = gClient->GetGC(&valEntry, kTRUE);
	////////////////////////////////////////////////////////////////////////////

	for (unsigned i = 0; i < tablePickColumns; i++)
	{
		fTableCellPick[line_index][i] = new TGTextEntry(Frame, new TGTextBuffer(12), -1, uGC->GetGC(), ufont->GetFontStruct(), kOwnBackground);
		fTableCellPick[line_index][i]->SetHeight(17);
	}

	fTableCellPick[line_index][0]->SetText(cell_name);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fTableCellPick[line_index][0], new TGLayoutHints(kLHintsLeft | kLHintsTop, 1, 0, 1, 0));
	for (unsigned i = 1; i < tablePickColumns; i++) 
	Frame->AddFrame(fTableCellPick[line_index][i], new TGLayoutHints(          kLHintsExpandX, 1, 0, 1, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
	
    return Frame;
}

void TablePick(TGCompositeFrame *owner)
{
	// constants ---------------------------------------------------------------

	const char* cell_name[tablePickRows] = {"Detector", "Energy", "Eta", "Phi", "PMT 1", "PMT 2"};

	// Implement ---------------------------------------------------------------

	fPickFrame = new TGVerticalFrame(owner);
	fTableCellPick = new TGTextEntry**[tablePickRows];

	for (unsigned i = 0; i < tablePickRows; i++)
	{
		TGHorizontalFrame* tmpFrame = TablePickLine(fPickFrame, i, cell_name[i]);
		if(i == 4 || i == 5){
            fPMTFrame[i%4] = tmpFrame;
		}
	}

	owner->AddFrame(fPickFrame, new TGLayoutHints(kLHintsExpandX));
}

void FramePickButton(TGCompositeFrame *owner)
{
	TGVerticalFrame *Frame = new TGVerticalFrame(owner);

	// Create components -------------------------------------------------------

	fTextButtonPick = new TGTextButton(Frame, "Pick");

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fTextButtonPick, new TGLayoutHints(kLHintsExpandX));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void TableInputLine(TGCompositeFrame *owner, int line_index, int ncol, const char *cell_name)
{
	// Main frame --------------------------------------------------------------

	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fTableCellInput[line_index] = new TGTextEntry*[ncol];

	////////////////////////////////////////////////////////////////////////////
	// Peace of code to generate a flat layout (to complicated!!)
	TGFont *ufont;
	ufont = gClient->GetFont("-*-helvetica-medium-r-*-*-12-*-*-*-*-*-iso8859-1");
	TGGC *uGC;
	GCValues_t valEntry;
	valEntry.fMask = kGCForeground | kGCBackground | kGCFillStyle | kGCFont | kGCGraphicsExposures;
	gClient->GetColorByName("#000000",valEntry.fForeground);
	gClient->GetColorByName("#c0c0c0",valEntry.fBackground);
	valEntry.fFillStyle = kFillSolid;
	valEntry.fFont = ufont->GetFontHandle();
	valEntry.fGraphicsExposures = kFALSE;
	uGC = gClient->GetGC(&valEntry, kTRUE);
	////////////////////////////////////////////////////////////////////////////

	for (int i = 0; i < ncol; i++)
	{
		fTableCellInput[line_index][i] = new TGTextEntry(Frame, new TGTextBuffer(12), -1, uGC->GetGC(), ufont->GetFontStruct(), kOwnBackground);
		fTableCellInput[line_index][i]->SetHeight(17);
	}

	fTableCellInput[line_index][0]->SetText(cell_name);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fTableCellInput[line_index][0], new TGLayoutHints(kLHintsLeft | kLHintsTop, 1, 0, 1, 0));
	for (int i = 1; i < ncol; i++) 
	Frame->AddFrame(fTableCellInput[line_index][i], new TGLayoutHints(          kLHintsExpandX, 1, 0, 1, 0));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void TableInput(TGCompositeFrame *owner)
{
	// constants ---------------------------------------------------------------

	const int nlin = tableInputRows, ncol = tableInputColumns;
	const char* cell_name[tableInputRows] = {"Run mode", "Current directory", "File name", "Run number", "Event number", "Time", "Trigger Type"};

	// Implement ---------------------------------------------------------------

	TGVerticalFrame *Frame = new TGVerticalFrame(owner);
	       fTableCellInput = new TGTextEntry**[nlin];

	for (int i = 0; i < nlin; i++)
	{
		TableInputLine(Frame, i, ncol, cell_name[i]);
	}

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void GroupFrameVisHEC(TGCompositeFrame *owner)
{
	TGGroupFrame *Frame = new TGGroupFrame(owner, "Visibility");

	FrameVisHECFrom(Frame);
	FrameVisHECTo  (Frame);
	FrameUseMaxHEC (Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void GroupFramePalHEC(TGCompositeFrame *owner)
{
	TGGroupFrame *Frame = new TGGroupFrame(owner, "Palette");

	FramePalHECFrom(Frame);
	FramePalHECTo  (Frame);
	FramePalPalHEC (Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void GroupFrameVisLArg(TGCompositeFrame *owner)
{
	TGGroupFrame *Frame = new TGGroupFrame(owner, "Visibility");

	FrameVisLArgFrom(Frame);
	FrameVisLArgTo  (Frame);
	FrameUseMaxLArg (Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void GroupFramePalLArg(TGCompositeFrame *owner)
{
	TGGroupFrame *Frame = new TGGroupFrame(owner, "Palette");

	FramePalLArgFrom(Frame);
	FramePalLArgTo  (Frame);
	FramePalPalLArg (Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void GroupFrameActive(TGCompositeFrame *owner)
{
	TGGroupFrame *Frame = new TGGroupFrame(owner, "Calo");

	FrameActiveTile(Frame);
	FrameActiveHEC (Frame);
	FrameActiveLArg(Frame);
	FrameActiveFCal(Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsLeft | kLHintsTop));
}

void GroupFrameEBShift(TGCompositeFrame *owner)
{
	TGGroupFrame *Frame = new TGGroupFrame(owner, "Partition");

	FrameBarrel  (Frame);
	FrameEBAShift(Frame);
	FrameEBCShift(Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void GroupFrameBarrel(TGCompositeFrame *owner)
{
	TGGroupFrame *Frame = new TGGroupFrame(owner, "Barrel");

	FrameBoundTileLArg(Frame);
	FrameBoundTile    (Frame);
	FrameBoundLArg    (Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void GroupFrameEBarrel(TGCompositeFrame *owner)
{
	TGGroupFrame *Frame = new TGGroupFrame(owner, "Extended Barrel");

	FrameBoundTileHEC (Frame);
	FrameBoundTileEB  (Frame);
	FrameBoundHEC     (Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameHEC(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	GroupFrameVisHEC(Frame);
	GroupFramePalHEC(Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameLArg(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	GroupFrameVisLArg(Frame);
	GroupFramePalLArg(Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameDisplayCalo(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	GroupFrameActive (Frame);
	GroupFrameEBShift(Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameBoundBEB(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	GroupFrameBarrel (Frame);
	GroupFrameEBarrel(Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameBounds(TGCompositeFrame *owner)
{
	TGVerticalFrame *Frame = new TGVerticalFrame(owner);

	FrameBoundBEB    (Frame);
	FrameTransparency(Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void GroupFrameStyle(TGCompositeFrame *owner)
{
	TGGroupFrame *Frame = new TGGroupFrame(owner, "Style");

	FrameWireframe (Frame);
	FrameSolid     (Frame);
	FrameOutline   (Frame);
	FrameBackground(Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsLeft | kLHintsTop));
}

void GroupFrameAnimate(TGCompositeFrame *owner)
{
	TGGroupFrame *Frame = new TGGroupFrame(owner, "Animate");

	FrameDistance (Frame);
	FrameSpeed    (Frame);
	FrameAngle    (Frame);
	FrameActivated(Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameGraphic(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	GroupFrameStyle  (Frame);
	GroupFrameAnimate(Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FramePick(TGCompositeFrame *owner)
{
	TGVerticalFrame *Frame = new TGVerticalFrame(owner);

	FramePickButton(Frame);
	TablePick(Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FramePaletteTile(TGCompositeFrame *owner)
{
	TGGroupFrame *GroupFrame = new TGGroupFrame(owner, "Tile", kVerticalFrame);
	TGHorizontalFrame *Frame = new TGHorizontalFrame(GroupFrame);
			fEnergyFrameTile = new TGHorizontalFrame(GroupFrame);

	// Create components -------------------------------------------------------

	    fCanPalT  = new TRootEmbeddedCanvas("Palette", Frame, 130, 22);
	fLabelMinTile = new TGLabel(fEnergyFrameTile, TGString((int)fNumberEntryTilePalMin->GetNumber()) + " MeV");
	fLabelMaxTile = new TGLabel(fEnergyFrameTile, TGString((int)fNumberEntryTilePalMax->GetNumber()) + " MeV"); 

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCanPalT, new TGLayoutHints(kLHintsExpandX, 2,  2, 8,  2));
	fEnergyFrameTile->AddFrame(fLabelMinTile, new TGLayoutHints(kLHintsLeft));
	fEnergyFrameTile->AddFrame(fLabelMaxTile, new TGLayoutHints(kLHintsRight));

	// Add itself to owner frame -----------------------------------------------

	GroupFrame->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
	GroupFrame->AddFrame(fEnergyFrameTile, new TGLayoutHints(kLHintsExpandX));
	owner->AddFrame(GroupFrame, new TGLayoutHints(kLHintsExpandX));
}

void FramePaletteLArg(TGCompositeFrame *owner)
{
	TGGroupFrame *GroupFrame = new TGGroupFrame(owner, "LArg", kVerticalFrame);
	TGHorizontalFrame *Frame = new TGHorizontalFrame(GroupFrame);
			fEnergyFrameLArg = new TGHorizontalFrame(GroupFrame);

	// Create components -------------------------------------------------------

	    fCanPalL  = new TRootEmbeddedCanvas("Palette", Frame, 130, 22);
	fLabelMinLArg = new TGLabel(fEnergyFrameLArg, TGString((int)fNumberEntryLArgPalMin->GetNumber()) + " MeV");
	fLabelMaxLArg = new TGLabel(fEnergyFrameLArg, TGString((int)fNumberEntryLArgPalMax->GetNumber()) + " MeV"); 

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCanPalL , new TGLayoutHints(kLHintsExpandX, 2,  2, 8,  2));
	fEnergyFrameLArg->AddFrame(fLabelMinLArg, new TGLayoutHints(kLHintsLeft));
	fEnergyFrameLArg->AddFrame(fLabelMaxLArg, new TGLayoutHints(kLHintsRight));
	// Add itself to owner frame -----------------------------------------------

	GroupFrame->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
	GroupFrame->AddFrame(fEnergyFrameLArg, new TGLayoutHints(kLHintsExpandX));
	owner->AddFrame(GroupFrame, new TGLayoutHints(kLHintsExpandX));
}

void FrameXmlTracks(TGCompositeFrame *owner)
{
	TGHorizontalFrame *Frame = new TGHorizontalFrame(owner);

	// Create components -------------------------------------------------------

	fCheckButtonShowTrack   = new TGCheckButton(Frame, "Show tracks with pt above");
	fNumberEntryTrackThresh = new TGNumberEntry(Frame, 1.0, 4);

	fCheckButtonShowTrack->SetDown(true);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCheckButtonShowTrack  , new TGLayoutHints(kLHintsTop | kLHintsLeft , 3, 3, 5, 3));
	Frame->AddFrame(fNumberEntryTrackThresh, new TGLayoutHints(kLHintsTop | kLHintsLeft , 3, 3, 3, 3));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameHoughTracks(TGCompositeFrame *owner)
{
	TGVerticalFrame *Frame = new TGVerticalFrame(owner);

	// Create components -------------------------------------------------------

	fCheckButtonCompTrack   = new TGCheckButton(Frame, "Compute tracks from TileCal (for cosmics)");

	fCheckButtonCompTrack->SetDown(false);

	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCheckButtonCompTrack  , new TGLayoutHints(kLHintsTop | kLHintsLeft , 3, 3, 10, 3));

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FrameTracks(TGCompositeFrame *owner)
{
	TGVerticalFrame *Frame = new TGVerticalFrame(owner);

	FrameHoughTracks(Frame);
	FrameXmlTracks  (Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void FramePaletteHEC(TGCompositeFrame *owner)
{
	TGGroupFrame *GroupFrame = new TGGroupFrame(owner, "HEC", kVerticalFrame);
	TGHorizontalFrame *Frame = new TGHorizontalFrame(GroupFrame);
			 fEnergyFrameHEC = new TGHorizontalFrame(GroupFrame);

	// Create components -------------------------------------------------------

	   fCanPalH  = new TRootEmbeddedCanvas("Palette", Frame, 130, 22);
	fLabelMinHEC = new TGLabel(fEnergyFrameHEC, TGString((int)fNumberEntryHECPalMin->GetNumber()) + " MeV");
	fLabelMaxHEC = new TGLabel(fEnergyFrameHEC, TGString((int)fNumberEntryHECPalMax->GetNumber()) + " MeV"); 


	// Add components ----------------------------------------------------------

	Frame->AddFrame(fCanPalH , new TGLayoutHints(kLHintsExpandX, 2,  2, 8,  2));
	fEnergyFrameHEC->AddFrame(fLabelMinHEC, new TGLayoutHints(kLHintsLeft));
	fEnergyFrameHEC->AddFrame(fLabelMaxHEC, new TGLayoutHints(kLHintsRight));

	// Add itself to owner frame -----------------------------------------------

	GroupFrame->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
	GroupFrame->AddFrame(fEnergyFrameHEC, new TGLayoutHints(kLHintsExpandX));
	owner->AddFrame(GroupFrame, new TGLayoutHints(kLHintsExpandX));
}

void GroupFramePalette(TGCompositeFrame *owner)
{
	TGGroupFrame *Frame = new TGGroupFrame(owner, "Palette", kVerticalFrame);

	FramePaletteTile(Frame);
	FramePaletteLArg(Frame);
	FramePaletteHEC (Frame);

	owner->AddFrame(Frame, new TGLayoutHints(kLHintsExpandX));
}

void TabCalo(TGCompositeFrame *owner)
{
	TGTab *Tab = new TGTab(owner);

	// Create a TGCompsiteFrame to each tab ------------------------------------

	TGCompositeFrame *CompositeFrame1;
	TGCompositeFrame *CompositeFrame2;
	TGCompositeFrame *CompositeFrame3;

	// Associate a Frame to a Tab ----------------------------------------------

	CompositeFrame1 = Tab->AddTab("TileCal");
	CompositeFrame2 = Tab->AddTab(    "HEC");
	CompositeFrame3 = Tab->AddTab(   "LArg");

	// Populate tab frame ------------------------------------------------------

	FrameTileCal(CompositeFrame1);
	FrameHEC    (CompositeFrame2);
	FrameLArg   (CompositeFrame3);

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Tab, new TGLayoutHints(kLHintsExpandX));
}

void TabDisplay(TGCompositeFrame *owner)
{
	TGTab *Tab = new TGTab(owner);

	// Create a TGCompsiteFrame to each tab ------------------------------------

	TGCompositeFrame *CompositeFrame1;
	TGCompositeFrame *CompositeFrame2;
	TGCompositeFrame *CompositeFrame3;
	TGCompositeFrame *CompositeFrame4;

	// Associate a Frame to a Tab ----------------------------------------------

	CompositeFrame1 = Tab->AddTab("Detector");
	CompositeFrame2 = Tab->AddTab("Bounds"  );
	CompositeFrame3 = Tab->AddTab("Graphic" );
	CompositeFrame4 = Tab->AddTab("Tracks"  );

	// Populate tab frame ------------------------------------------------------

	FrameDisplayCalo(CompositeFrame1);
	FrameBounds     (CompositeFrame2);
	FrameGraphic    (CompositeFrame3);
	FrameTracks     (CompositeFrame4);

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Tab, new TGLayoutHints(kLHintsExpandX));
}

void TabMain(TGCompositeFrame *owner)
{
	TGTab *Tab = new TGTab(owner);

	// Create a TGCompsiteFrame to each tab ------------------------------------

	TGCompositeFrame *CompositeFrame1;
	TGCompositeFrame *CompositeFrame2;
	TGCompositeFrame *CompositeFrame3;

	// Associate a Frame to a Tab ----------------------------------------------

	CompositeFrame1 = Tab->AddTab(  "Input");
	CompositeFrame2 = Tab->AddTab(   "Calo");
	CompositeFrame3 = Tab->AddTab("Display");

	// Populate tab frame ------------------------------------------------------

	TabInput  (CompositeFrame1);
	TabCalo   (CompositeFrame2);
	TabDisplay(CompositeFrame3);

	// Add itself to owner frame -----------------------------------------------

	owner->AddFrame(Tab, new TGLayoutHints(kLHintsExpandX));
}

void TabStatus(TGCompositeFrame *owner)
{
	TGTab *Tab = new TGTab(owner);

	// Create a TGCompsiteFrame to each tab ------------------------------------

	TGCompositeFrame *CompositeFrame1;
	TGCompositeFrame *CompositeFrame2;

	// Associate a Frame to a Tab ----------------------------------------------

	CompositeFrame1 = Tab->AddTab("Input");
	CompositeFrame2 = Tab->AddTab( "Pick");

	// Populate tab frame ------------------------------------------------------

	TableInput(CompositeFrame1);
	FramePick (CompositeFrame2);

	// Add itself to owner frame ---------------------------------------------------

	owner->AddFrame(Tab, new TGLayoutHints(kLHintsExpandX));
}

void MainFrame()
{
	TGMainFrame*       appFrame = new TGMainFrame(gClient->GetRoot(), APPWIDTH, APPHEIGHT);
	TGCompositeFrame* mainFrame = new TGCompositeFrame(appFrame, APPWIDTH, APPHEIGHT, kHorizontalFrame);

	appFrame->SetWindowName("CaloViewer3D");
	appFrame->AddFrame(mainFrame, new TGLayoutHints(kLHintsExpandX | kLHintsExpandY));

	fGLContainerFrame = new TGCompositeFrame(mainFrame);
	fToolFrame        = new TGCompositeFrame(mainFrame);

	// Add sub-frames ----------------------------------------------------------

	          TabMain(fToolFrame);
	        TabStatus(fToolFrame);
	GroupFramePalette(fToolFrame);

	// Show Main window --------------------------------------------------------

	mainFrame->AddFrame(fGLContainerFrame, new TGLayoutHints(kLHintsExpandX | kLHintsExpandY));
	mainFrame->AddFrame(fToolFrame,        new TGLayoutHints(kLHintsExpandY));

	appFrame->MapSubwindows();
	appFrame->Resize();
	appFrame->MapWindow();
	//appFrame->MapRaised();
	
	fPickFrame->HideFrame(fPMTFrame[0]);
	fPickFrame->HideFrame(fPMTFrame[1]);
}

// Event Handler ---------------------------------------------------------------

void OnLoadFileEvent()
{
	fNumberEntryFileIndex->SetNumber(cgvGetFileIndex()+1);
	fLabelFileIndex->SetText(Form("of %d", cgvGetFileNumber()));

	fTableCellInput[2][1]->SetText(             cgvGetFileName());
	fTableCellInput[3][1]->SetText(Form("%d", cgvGetRunNumber()));
	fTableCellInput[4][1]->SetText(Form("%d",  cgvGetEvNumber()));
	fTableCellInput[5][1]->SetText(               cgvGetEvTime());
	fTableCellInput[6][1]->SetText(          cgvGetTriggerType());
}

void OnSwitchOnline(bool on)
{
	OnLoadFileEvent();

	if (on) fCheckButtonNextFile->SetState(kButtonDown);

	fTextButtonOfflineDir->SetEnabled(!on);
	  fPictureButtonStart->SetEnabled(!on);
	   fPictureButtonStop->SetEnabled( on);
	 fCheckButtonNextFile->SetEnabled(!on);

	fNumberEntryFileIndex->GetButtonUp   ()->SetEnabled(!on);
	fNumberEntryFileIndex->GetButtonDown ()->SetEnabled(!on);
	fNumberEntryFileIndex->GetNumberEntry()->SetEnabled(!on);
	 fNumberEntryNextFile->GetButtonUp   ()->SetEnabled(!on);
	 fNumberEntryNextFile->GetButtonDown ()->SetEnabled(!on);
	 fNumberEntryNextFile->GetNumberEntry()->SetEnabled(!on);

	if (on) fTableCellInput[0][1]->SetText( "Online");
	else    fTableCellInput[0][1]->SetText("Offline");
}

void OnCurDirChange(const char *dir)
{
	fTableCellInput[1][1]->SetText(dir);
}

void ConnectEvents()
{
	cgvOnLoadFile     = OnLoadFileEvent;
	cgvOnOnlineChange = OnSwitchOnline ;
	cgvOnCurDirChange = OnCurDirChange ;
}

void InitialStates()
{
	int i;

	fTableCellInput[0][1]->SetText("Offline");

	fCanPalT->GetCanvas()->cd();
	for (i = 0; i < 256; i++) fBox_T[i] = new TBox(i/256.0, 0, (i+1)/256.0, 1);
	cgvDrawPalette(fBox_T,   HOT);
	fCanPalT->GetCanvas()->Update();

	fCanPalL->GetCanvas()->cd();
	for (i = 0; i < 256; i++) fBox_L[i] = new TBox(i/256.0, 0, (i+1)/256.0, 1);
	cgvDrawPalette(fBox_L, GREEN);
	fCanPalL->GetCanvas()->Update();

	fCanPalH->GetCanvas()->cd();
	for (i = 0; i < 256; i++) fBox_H[i] = new TBox(i/256.0, 0, (i+1)/256.0, 1);
	cgvDrawPalette(fBox_H,  BLUE);
	fCanPalH->GetCanvas()->Update();
}

// Slot connections ------------------------------------------------------------

void TGUISlot::OpenDirOffline()
{
	TGFileInfo fi;
	if (GetFile(fi)) cgvLoadXMLFile(fi.fFilename);
}

void TGUISlot::OpenDirOnline()
{
	TGFileInfo fi;
	if (GetFile(fi))
	{
		             cgvSetOnlineDir(gSystem->DirName(fi.fFilename));
		fTextEntryOnlineDir->SetText(gSystem->DirName(fi.fFilename));
	}
}

void TGUISlot::FileIndex(Long_t)
{
	if (!cgvLoadXMLFileByIndex((unsigned int)(fNumberEntryFileIndex->GetNumber()-1)))
	{
		fNumberEntryFileIndex->SetNumber(1);
		cgvLoadXMLFileByIndex(0);
	};
}

void TGUISlot::NextFileByTime()
{
	cgvLoadNextFileByTime(fCheckButtonNextFile->IsDown());
}

void TGUISlot::NextFileTime(Long_t)
{
	cgvSetNextFileTime((Long_t)(fNumberEntryNextFile->GetNumber()*1000.0));
}

void TGUISlot::OnlineStart()
{
	cgvSetOnline(true);
}

void TGUISlot::OnlineStop()
{
	cgvSetOnline(false);
}

void TGUISlot::TileThreshMin(Long_t)
{
	cgvSetTileThreshMin(fNumberEntryTileThreshMin->GetNumber()/1000.0);
}

void TGUISlot::TileThreshMax(Long_t)
{
	cgvSetTileThreshMax(fNumberEntryTileThreshMax->GetNumber()/1000.0);
}

void TGUISlot::TilePalMin(Long_t)
{
	fLabelMinTile->SetText(TGString((int)fNumberEntryTilePalMin->GetNumber()) + " MeV");
	fEnergyFrameTile->Layout();
	cgvSetMinColorValueTile(fNumberEntryTilePalMin->GetNumber()/1000.0);
}

void TGUISlot::TilePalMax(Long_t)
{
	fLabelMaxTile->SetText(TGString((int)fNumberEntryTilePalMax->GetNumber()) + " MeV");
	fEnergyFrameTile->Layout();
	cgvSetMaxColorValueTile(fNumberEntryTilePalMax->GetNumber()/1000.0);
}

void TGUISlot::UseMaxThreshTile()
{
	cgvSetUseMaxThreshTile(fCheckButtonUseMaxTile->IsDown());
}

void TGUISlot::PaletteTile()
{
	switch (fComboBoxPalTile->GetSelected())
	{
		case 0: cgvSetPaletteTile(  GRAY); cgvDrawPalette(fBox_T,   GRAY); break;
		case 1: cgvSetPaletteTile(   HOT); cgvDrawPalette(fBox_T,    HOT); break;
		case 2: cgvSetPaletteTile( GREEN); cgvDrawPalette(fBox_T,  GREEN); break;
		case 3: cgvSetPaletteTile(  BLUE); cgvDrawPalette(fBox_T,   BLUE); break;
		case 4: cgvSetPaletteTile(COPPER); cgvDrawPalette(fBox_T, COPPER); break;
	}

	fCanPalT->GetCanvas()->GetPad(0)->Modified();
	fCanPalT->GetCanvas()->Update();
}

void TGUISlot::HECThreshMin(Long_t)
{
	cgvSetHECThreshMin(fNumberEntryHECThreshMin->GetNumber()/1000.0);
}

void TGUISlot::HECThreshMax(Long_t)
{
	cgvSetHECThreshMax(fNumberEntryHECThreshMax->GetNumber()/1000.0);
}

void TGUISlot::HECPalMin(Long_t)
{
	fLabelMinHEC->SetText(TGString((int)fNumberEntryHECPalMin->GetNumber()) + " MeV");
	fEnergyFrameHEC->Layout();
	cgvSetMinColorValueHEC(fNumberEntryHECPalMin->GetNumber()/1000.0);
}

void TGUISlot::HECPalMax(Long_t)
{
	fLabelMaxHEC->SetText(TGString((int)fNumberEntryHECPalMax->GetNumber()) + " MeV");
	fEnergyFrameHEC->Layout();
	cgvSetMaxColorValueHEC(fNumberEntryHECPalMax->GetNumber()/1000.0);
}

void TGUISlot::UseMaxThreshHEC()
{
	cgvSetUseMaxThreshHEC(fCheckButtonUseMaxHEC->IsDown());
}

void TGUISlot::PaletteHEC()
{
	switch (fComboBoxPalHEC->GetSelected())
	{
		case 0: cgvSetPaletteHEC(  GRAY); cgvDrawPalette(fBox_H,   GRAY); break;
		case 1: cgvSetPaletteHEC(   HOT); cgvDrawPalette(fBox_H,    HOT); break;
		case 2: cgvSetPaletteHEC( GREEN); cgvDrawPalette(fBox_H,  GREEN); break;
		case 3: cgvSetPaletteHEC(  BLUE); cgvDrawPalette(fBox_H,   BLUE); break;
		case 4: cgvSetPaletteHEC(COPPER); cgvDrawPalette(fBox_H, COPPER); break;
	}

	fCanPalH->GetCanvas()->GetPad(0)->Modified();
	fCanPalH->GetCanvas()->Update();
}

void TGUISlot::LArgThreshMin(Long_t)
{
	cgvSetLArgThreshMin(fNumberEntryLArgThreshMin->GetNumber()/1000.0);
}

void TGUISlot::LArgThreshMax(Long_t)
{
	cgvSetLArgThreshMax(fNumberEntryLArgThreshMax->GetNumber()/1000.0);
}

void TGUISlot::LArgPalMin(Long_t)
{
	fLabelMinLArg->SetText(TGString((int)fNumberEntryLArgPalMin->GetNumber()) + " MeV");
	fEnergyFrameLArg->Layout();
	cgvSetMinColorValueLArg(fNumberEntryLArgPalMin->GetNumber()/1000.0);
}

void TGUISlot::LArgPalMax(Long_t)
{
	fLabelMaxLArg->SetText(TGString((int)fNumberEntryLArgPalMax->GetNumber()) + " MeV");
	fEnergyFrameLArg->Layout();
	cgvSetMaxColorValueLArg(fNumberEntryLArgPalMax->GetNumber()/1000.0);
}

void TGUISlot::UseMaxThreshLArg()
{
	cgvSetUseMaxThreshLArg(fCheckButtonUseMaxLArg->IsDown());
}

void TGUISlot::PaletteLArg()
{
	switch (fComboBoxPalLArg->GetSelected())
	{
		case 0: cgvSetPaletteLArg(  GRAY); cgvDrawPalette(fBox_L,   GRAY); break;
		case 1: cgvSetPaletteLArg(   HOT); cgvDrawPalette(fBox_L,    HOT); break;
		case 2: cgvSetPaletteLArg( GREEN); cgvDrawPalette(fBox_L,  GREEN); break;
		case 3: cgvSetPaletteLArg(  BLUE); cgvDrawPalette(fBox_L,   BLUE); break;
		case 4: cgvSetPaletteLArg(COPPER); cgvDrawPalette(fBox_L, COPPER); break;
	}

	fCanPalL->GetCanvas()->GetPad(0)->Modified();
	fCanPalL->GetCanvas()->Update();
}

void TGUISlot::ActiveTile()
{
	cgvSetTileActivated(fCheckButtonActiveTile->IsDown());
}

void TGUISlot::ActiveHEC()
{
	cgvSetHECActivated(fCheckButtonActiveHEC->IsDown());
}

void TGUISlot::ActiveLArg()
{
	cgvSetLArgActivated(fCheckButtonActiveLArg->IsDown());
}

void TGUISlot::EBAShift()
{
	cgvEBshift(fNumberEntryEBAShift->GetNumber(), true);
}

void TGUISlot::EBCShift()
{
	cgvEBshift(fNumberEntryEBCShift->GetNumber(), false);
}

void TGUISlot::ActiveEBA()
{
	cgvEBVisible(fCheckButtonEBAVisible->IsDown(), true);
}

void TGUISlot::ActiveEBC()
{
	cgvEBVisible(fCheckButtonEBCVisible->IsDown(), false);
}

void TGUISlot::UpdateBounds()
{
	int ba = TILELARG_BOUND, eb = TILEHEC_BOUND;

	     if (fRadioButtonBoundTileLArg->IsDown()) ba = TILELARG_BOUND;
	else if (    fRadioButtonBoundTile->IsDown()) ba =     TILE_BOUND;
	else if (    fRadioButtonBoundLArg->IsDown()) ba =     LARG_BOUND;
	     if ( fRadioButtonBoundTileHEC->IsDown()) eb =  TILEHEC_BOUND;
	else if (  fRadioButtonBoundTileEB->IsDown()) eb =     TILE_BOUND;
	else if (     fRadioButtonBoundHEC->IsDown()) eb =      HEC_BOUND;

	cgvSetBounds(ba, eb);
}

void TGUISlot::BoundTileLArg_Event()
{
	fRadioButtonBoundTile->SetState(kButtonUp);
	fRadioButtonBoundLArg->SetState(kButtonUp);

	UpdateBounds();
}

void TGUISlot::BoundTile_Event()
{
	fRadioButtonBoundTileLArg->SetState(kButtonUp);
	    fRadioButtonBoundLArg->SetState(kButtonUp);

	UpdateBounds();
}

void TGUISlot::BoundLArg_Event()
{
	    fRadioButtonBoundTile->SetState(kButtonUp);
	fRadioButtonBoundTileLArg->SetState(kButtonUp);

	UpdateBounds();
}

void TGUISlot::BoundTileHEC()
{
	fRadioButtonBoundTileEB->SetState(kButtonUp);
	   fRadioButtonBoundHEC->SetState(kButtonUp);

	UpdateBounds();
}

void TGUISlot::BoundTileEB()
{
	fRadioButtonBoundTileHEC->SetState(kButtonUp);
	    fRadioButtonBoundHEC->SetState(kButtonUp);

	UpdateBounds();
}

void TGUISlot::BoundHEC()
{
	fRadioButtonBoundTileHEC->SetState(kButtonUp);
	 fRadioButtonBoundTileEB->SetState(kButtonUp);

	UpdateBounds();
}

void TGUISlot::Transparency()
{
	cgvSetBoundTransparency((char)fNumberEntryTransparency->GetNumber());
}

void TGUISlot::Background()
{
	cgvSetBckGroundColor(fColorSelectBackground->GetColor());
}

void TGUISlot::TranspColor()
{
	cgvSetBoundColor(fColorSelectTransparency->GetColor());
}

void TGUISlot::WireframeStyle()
{
	  fRadioButtonSolid->SetState(kButtonUp);
	fRadioButtonOutline->SetState(kButtonUp);

	cgvSetGraphicStyle(WIREFRAME);
}

void TGUISlot::SolidStyle()
{
	fRadioButtonWireframe->SetState(kButtonUp);
	  fRadioButtonOutline->SetState(kButtonUp);

	cgvSetGraphicStyle(SOLID);
}

void TGUISlot::OutlineStyle()
{
	    fRadioButtonSolid->SetState(kButtonUp);
	fRadioButtonWireframe->SetState(kButtonUp);

	cgvSetGraphicStyle(OUTLINE);
}

void TGUISlot::Activated()
{
	cgvAnimate(fCheckButtonActivated->IsDown());
}

void TGUISlot::Distance()
{
	cgvSetCameraDist(fNumberEntryDistance->GetNumber()*1000.0);
}

void TGUISlot::TrackThresh()
{
	cgvSetTrackThresh(fNumberEntryTrackThresh->GetNumber());
}

void TGUISlot::CameraSpeed()
{
	cgvSetCameraSpeed(fHSliderSpeed->GetPosition()/10.0);
}

void TGUISlot::CameraAngle()
{
	cgvSetCameraAngle(fHSliderAngle->GetPosition());
}

void TGUISlot::BarrelVisible()
{
	cgvBarVisible(fCheckButtonBarrel->IsDown());
}

void TGUISlot::PickUpdate()
{
	 cgvUpdatePickInfos();
	fTableCellPick[0][1]->SetText(                 cgvGetPickCalo  () );
	fTableCellPick[1][1]->SetText(Form("%.4f GeV", cgvGetPickEnergy()));
	fTableCellPick[2][1]->SetText(Form("%.3f"    , cgvGetPickEta   ()));
	fTableCellPick[3][1]->SetText(Form("%.3f"    , cgvGetPickPhi   ()));

	if(!strcmp(cgvGetPickCalo(),"Hadronic Tile Calorimeter"))
	{
		fPickFrame->ShowFrame(fPMTFrame[0]);
		fPickFrame->ShowFrame(fPMTFrame[1]);
		fTableCellPick[4][1]->SetText(Form("%d", cgvGetPickPMT1()));
		fTableCellPick[5][1]->SetText(Form("%d", cgvGetPickPMT2()));
	}
	else
	{
		fPickFrame->HideFrame(fPMTFrame[0]);
		fPickFrame->HideFrame(fPMTFrame[1]);
	}
}

void TGUISlot::CompTrack()
{
	cgvSetShowTracks(fCheckButtonCompTrack->IsDown());
}

void TGUISlot::ShowTrack()
{
	cgvSetShowXMLTracks(fCheckButtonShowTrack->IsDown());
}

void ConnectSlots()
{

		fGUISlot = new TGUISlot();

	           fTextButtonOfflineDir->Connect(             "Clicked()", "TGUISlot", fGUISlot,      "OpenDirOffline()");
	           fNumberEntryFileIndex->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot,     "FileIndex(Long_t)");
	            fCheckButtonNextFile->Connect(             "Clicked()", "TGUISlot", fGUISlot,      "NextFileByTime()");
	            fNumberEntryNextFile->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot,  "NextFileTime(Long_t)");
	         fPictureButtonOnlineDir->Connect(             "Clicked()", "TGUISlot", fGUISlot,       "OpenDirOnline()");
	             fPictureButtonStart->Connect(             "Clicked()", "TGUISlot", fGUISlot,         "OnlineStart()");
	              fPictureButtonStop->Connect(             "Clicked()", "TGUISlot", fGUISlot,          "OnlineStop()");
	       fNumberEntryTileThreshMin->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot, "TileThreshMin(Long_t)");
	       fNumberEntryTileThreshMax->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot, "TileThreshMax(Long_t)");
	          fCheckButtonUseMaxTile->Connect(             "Clicked()", "TGUISlot", fGUISlot,    "UseMaxThreshTile()");
	          fNumberEntryTilePalMin->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot,    "TilePalMin(Long_t)");
	          fNumberEntryTilePalMax->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot,    "TilePalMax(Long_t)");
	fComboBoxPalTile->GetTextEntry()->Connect(    "TextChanged(char*)", "TGUISlot", fGUISlot,         "PaletteTile()");
	        fNumberEntryHECThreshMin->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot,  "HECThreshMin(Long_t)");
	        fNumberEntryHECThreshMax->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot,  "HECThreshMax(Long_t)");
	           fCheckButtonUseMaxHEC->Connect(             "Clicked()", "TGUISlot", fGUISlot,     "UseMaxThreshHEC()");
	           fNumberEntryHECPalMin->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot,     "HECPalMin(Long_t)");
	           fNumberEntryHECPalMax->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot,     "HECPalMax(Long_t)");
	 fComboBoxPalHEC->GetTextEntry()->Connect(    "TextChanged(char*)", "TGUISlot", fGUISlot,          "PaletteHEC()");
	          fCheckButtonActiveTile->Connect(             "Clicked()", "TGUISlot", fGUISlot,          "ActiveTile()");
	           fCheckButtonActiveHEC->Connect(             "Clicked()", "TGUISlot", fGUISlot,           "ActiveHEC()");
	          fCheckButtonActiveLArg->Connect(             "Clicked()", "TGUISlot", fGUISlot,          "ActiveLArg()");
	       fNumberEntryLArgThreshMin->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot, "LArgThreshMin(Long_t)");
	       fNumberEntryLArgThreshMax->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot, "LArgThreshMax(Long_t)");
	          fCheckButtonUseMaxLArg->Connect(             "Clicked()", "TGUISlot", fGUISlot,    "UseMaxThreshLArg()");
	          fNumberEntryLArgPalMin->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot,    "LArgPalMin(Long_t)");
	          fNumberEntryLArgPalMax->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot,    "LArgPalMax(Long_t)");
	fComboBoxPalLArg->GetTextEntry()->Connect(    "TextChanged(char*)", "TGUISlot", fGUISlot,         "PaletteLArg()");
	            fNumberEntryEBAShift->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot,            "EBAShift()");
	            fNumberEntryEBCShift->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot,            "EBCShift()");
	          fCheckButtonEBAVisible->Connect(             "Clicked()", "TGUISlot", fGUISlot,           "ActiveEBA()");
	          fCheckButtonEBCVisible->Connect(             "Clicked()", "TGUISlot", fGUISlot,           "ActiveEBC()");
	       fRadioButtonBoundTileLArg->Connect(             "Clicked()", "TGUISlot", fGUISlot,       "BoundTileLArg_Event()");
	           fRadioButtonBoundTile->Connect(             "Clicked()", "TGUISlot", fGUISlot,           "BoundTile_Event()");
	           fRadioButtonBoundLArg->Connect(             "Clicked()", "TGUISlot", fGUISlot,           "BoundLArg_Event()");
	        fRadioButtonBoundTileHEC->Connect(             "Clicked()", "TGUISlot", fGUISlot,        "BoundTileHEC()");
	         fRadioButtonBoundTileEB->Connect(             "Clicked()", "TGUISlot", fGUISlot,         "BoundTileEB()");
	            fRadioButtonBoundHEC->Connect(             "Clicked()", "TGUISlot", fGUISlot,            "BoundHEC()");
	        fNumberEntryTransparency->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot,        "Transparency()");
	        fColorSelectTransparency->Connect("ColorSelected(Pixel_t)", "TGUISlot", fGUISlot,         "TranspColor()");
	           fRadioButtonWireframe->Connect(             "Clicked()", "TGUISlot", fGUISlot,      "WireframeStyle()");
	               fRadioButtonSolid->Connect(             "Clicked()", "TGUISlot", fGUISlot,          "SolidStyle()");
	             fRadioButtonOutline->Connect(             "Clicked()", "TGUISlot", fGUISlot,        "OutlineStyle()");
	          fColorSelectBackground->Connect("ColorSelected(Pixel_t)", "TGUISlot", fGUISlot,          "Background()");
	           fCheckButtonActivated->Connect(             "Clicked()", "TGUISlot", fGUISlot,           "Activated()");
	            fNumberEntryDistance->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot,            "Distance()");
	                   fHSliderSpeed->Connect("PositionChanged(Int_t)", "TGUISlot", fGUISlot,         "CameraSpeed()");
	                   fHSliderAngle->Connect("PositionChanged(Int_t)", "TGUISlot", fGUISlot,         "CameraAngle()");
	              fCheckButtonBarrel->Connect(             "Clicked()", "TGUISlot", fGUISlot,       "BarrelVisible()");
	                 fTextButtonPick->Connect(             "Clicked()", "TGUISlot", fGUISlot,          "PickUpdate()");
	           fCheckButtonCompTrack->Connect(             "Clicked()", "TGUISlot", fGUISlot,           "CompTrack()");
	           fCheckButtonShowTrack->Connect(             "Clicked()", "TGUISlot", fGUISlot,           "ShowTrack()");
	         fNumberEntryTrackThresh->Connect(      "ValueSet(Long_t)", "TGUISlot", fGUISlot,         "TrackThresh()");
}

// Main function ---------------------------------------------------------------

void CaloGeoGUI()
{
	MainFrame    ();
	ConnectSlots ();
	ConnectEvents();
	InitialStates();

	cgvInit(fGLContainerFrame);
	cgvLoadXMLFile("JiveXML_161520_18445417.xml");
}
