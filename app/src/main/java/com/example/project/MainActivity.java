package com.example.project;

import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.activity.EdgeToEdge;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.textfield.TextInputEditText;
import com.google.firebase.auth.FirebaseAuth;

public class MainActivity extends AppCompatActivity {

    private TextInputEditText etEmail, etPassword;
    private ProgressBar progressBar;
    private MaterialButton btnLogin, btnGoRegister, btnForgot;
    private FirebaseAuth fa;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        setContentView(R.layout.activity_main);

        View root = findViewById(R.id.root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            androidx.graphics.Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });

        etEmail = findViewById(R.id.etEmail);
        etPassword = findViewById(R.id.etPassword);
        progressBar = findViewById(R.id.progressBar);
        btnLogin = findViewById(R.id.btnLogin);
        btnGoRegister = findViewById(R.id.btnGoRegister);
        btnForgot = findViewById(R.id.btnForgot);

        fa = FirebaseAuth.getInstance();
        progressBar.setVisibility(View.GONE);

        if (fa.getCurrentUser() != null) {
            openDashboard();
        }

        btnLogin.setOnClickListener(v -> login());
        btnForgot.setOnClickListener(v -> sendReset());
        btnGoRegister.setOnClickListener(v -> startActivity(new Intent(this, second.class)));
    }

    private void login() {
        String email = text(etEmail);
        String password = text(etPassword);

        if (TextUtils.isEmpty(email)) {
            etEmail.setError("Email enter karein");
            etEmail.requestFocus();
            return;
        }
        if (TextUtils.isEmpty(password)) {
            etPassword.setError("Password enter karein");
            etPassword.requestFocus();
            return;
        }

        setLoading(true);
        fa.signInWithEmailAndPassword(email, password)
                .addOnCompleteListener(task -> {
                    setLoading(false);
                    if (task.isSuccessful()) {
                        Toast.makeText(this, "Login successful", Toast.LENGTH_SHORT).show();
                        openDashboard();
                    } else {
                        Toast.makeText(this, AuthErrors.message(task.getException()), Toast.LENGTH_LONG).show();
                    }
                });
    }

    private void sendReset() {
        String email = text(etEmail);
        if (TextUtils.isEmpty(email)) {
            etEmail.setError("Pehle email enter karein");
            etEmail.requestFocus();
            return;
        }
        setLoading(true);
        fa.sendPasswordResetEmail(email)
                .addOnCompleteListener(task -> {
                    setLoading(false);
                    String msg = task.isSuccessful()
                            ? "Reset link email pe bhej diya hai"
                            : AuthErrors.message(task.getException());
                    Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
                });
    }

    private void openDashboard() {
        Intent intent = new Intent(this, Third.class);
        startActivity(intent);
        finish();
    }

    private void setLoading(boolean loading) {
        progressBar.setVisibility(loading ? View.VISIBLE : View.GONE);
        btnLogin.setEnabled(!loading);
        btnGoRegister.setEnabled(!loading);
        btnForgot.setEnabled(!loading);
    }

    private String text(TextInputEditText field) {
        return field.getText() == null ? "" : field.getText().toString().trim();
    }
}