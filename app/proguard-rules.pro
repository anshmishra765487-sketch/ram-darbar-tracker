# Firebase Auth ke liye ye rules zaroori hain (google-services plugin ke liye)
-keepattributes Signature
-keepattributes *Annotation*

-keep class com.google.firebase.auth.** { *; }
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**