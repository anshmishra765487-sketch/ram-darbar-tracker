package com.example.project;

import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException;
import com.google.firebase.auth.FirebaseAuthInvalidEmailException;
import com.google.firebase.auth.FirebaseAuthUserCollisionException;
import com.google.firebase.auth.FirebaseAuthWeakPasswordException;

public final class AuthErrors {

    private AuthErrors() {
    }

    public static String message(Exception e) {
        if (e instanceof FirebaseAuthInvalidEmailException) {
            return "Email sahi nahi hai";
        }
        if (e instanceof FirebaseAuthWeakPasswordException) {
            return "Password kamzor hai, kam se kam 6 characters rakhein";
        }
        if (e instanceof FirebaseAuthUserCollisionException) {
            return "Ye email pehle se registered hai, login karein";
        }
        if (e instanceof FirebaseAuthInvalidCredentialsException) {
            return "Email ya password galat hai";
        }
        if (e instanceof FirebaseAuthException) {
            String code = ((FirebaseAuthException) e).getAuthErrorCode();
            switch (code) {
                case FirebaseAuthException.ERROR_EMAIL_ALREADY_IN_USE:
                    return "Ye email pehle se registered hai, login karein";
                case FirebaseAuthException.ERROR_INVALID_EMAIL:
                    return "Email sahi nahi hai";
                case FirebaseAuthException.ERROR_OPERATION_NOT_ALLOWED:
                    return "Console me Email/Password sign-in ON nahi hai";
                case FirebaseAuthException.ERROR_NETWORK_REQUEST_FAILED:
                    return "Internet check karein, phir try karein";
                case FirebaseAuthException.ERROR_TOO_MANY_ATTEMPTS_TRY_LATER:
                    return "Bahut try kiye, thodi der baad karein";
                case FirebaseAuthException.ERROR_USER_DISABLED:
                    return "Ye account disable kar diya gaya hai";
                default:
                    return e.getMessage() == null ? "Kuch galat ho gaya" : e.getMessage();
            }
        }
        return e.getMessage() == null ? "Kuch galat ho gaya" : e.getMessage();
    }
}