void run()
{
	gROOT->ProcessLine(".L       CaloGeoXML.C+");
	gROOT->ProcessLine(".L        CaloHough.C+");
	gROOT->ProcessLine(".L CaloGeoInterface.C+");
	gROOT->ProcessLine(".L         CaloInfo.C+");
	gROOT->ProcessLine(".x       CaloGeoGUI.C+");
}
